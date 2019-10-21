import {
  ApolloError,
  AuthenticationError,
  withFilter
} from "apollo-server-koa";
import { DocumentModel, IDocument } from "../models/document";
import { ExerciseModel } from "../models/exercise";
import { FolderModel, IFolder } from "../models/folder";
import { SubmissionModel } from "../models/submission";
import { IUpload, UploadModel } from "../models/upload";
import { UserModel, IUser } from "../models/user";

import { logger, loggerController } from "../controllers/logs";
import { pubsub } from "../server";
import uploadResolver, { uploadDocumentImage } from "./upload";
import {
  getParentsPath,
  orderFunctions,
  OrderType,
  orderOptions
} from "../utils";

const DOCUMENT_UPDATED: string = "DOCUMENT_UPDATED";

const documentResolver = {
  Subscription: {
    documentUpdated: {
      subscribe: withFilter(
        // Filtra para devolver solo los documentos del usuario
        () => pubsub.asyncIterator([DOCUMENT_UPDATED]),
        (payload, variables, context) => {
          return (
            String(context.user.userID) === String(payload.documentUpdated.user)
          );
        }
      )
    }
  },

  Mutation: {
    /**
     * Create document: create a new empty document
     * It stores the new document in the database and if there is a image,
     * it uploads to Google Cloud and stores the public URL.
     * args: document information
     */
    createDocument: async (root: any, args: any, context: any) => {
      if (args.input.folder) {
        if (!(await FolderModel.findOne({ _id: args.input.folder }))) {
          throw new ApolloError("Folder does not exist", "FOLDER_NOT_FOUND");
        }
      }
      const documentNew: IDocument = new DocumentModel({
        user: context.user.userID,
        title: args.input.title,
        type: args.input.type,
        folder:
          args.input.folder ||
          (await UserModel.findOne({ _id: context.user.userID })).rootFolder,
        content: args.input.content,
        advancedMode: args.input.advancedMode,
        cache: args.input.cache,
        description: args.input.description,
        version: args.input.version,
        image: args.input.imageUrl
      });
      const newDocument: IDocument = await DocumentModel.create(documentNew);
      await FolderModel.updateOne(
        { _id: documentNew.folder },
        { $push: { documentsID: newDocument._id } },
        { new: true }
      );
      loggerController.storeInfoLog(
        "API",
        "document",
        "create",
        args.input.type,
        documentNew.user,
        ""
      );
      if (args.input.image) {
        const imageUploaded: IUpload = await uploadDocumentImage(
          //uploadResolver.Mutation.singleUpload(
          args.input.image,
          newDocument._id,
          context.user.userID
        );
        const newDoc: IDocument = await DocumentModel.findOneAndUpdate(
          { _id: documentNew._id },
          { $set: { image: imageUploaded.publicUrl } },
          { new: true }
        );
        pubsub.publish(DOCUMENT_UPDATED, { documentUpdated: newDoc });
        return newDoc;
      } else {
        pubsub.publish(DOCUMENT_UPDATED, { documentUpdated: newDocument });
        return newDocument;
      }
    },

    /**
     * Delete document: delete one document of the user logged.
     * It deletes the document passed in the arguments if it belongs to the user logged.
     * This method deletes all the exercises, submissions and uploads related with the document ID.
     * args: document ID
     */
    deleteDocument: async (root: any, args: any, context: any) => {
      const existDocument: IDocument = await DocumentModel.findOne({
        _id: args.id,
        user: context.user.userID
      });
      if (existDocument) {
        loggerController.storeInfoLog(
          "API",
          "document",
          "delete",
          existDocument.type,
          existDocument.user,
          ""
        );
        await FolderModel.updateOne(
          { _id: existDocument.folder }, // modifico los documentsID de la carpeta
          { $pull: { documentsID: existDocument._id } }
        );
        await UploadModel.deleteMany({ document: existDocument._id });
        await SubmissionModel.deleteMany({ document: existDocument._id });
        await ExerciseModel.deleteMany({ document: existDocument._id });
        return DocumentModel.deleteOne({ _id: args.id }); // delete all the document dependencies
      } else {
        throw new ApolloError(
          "You only can delete your documents",
          "DOCUMENT_NOT_FOUND"
        );
      }
    },

    /**
     *  Update document Content: update content of existing document.
     *  It updates document content with the new information provided.
     *  args: id, content and cache
     */
    updateDocumentContent: async (root: any, args: any, context: any) => {
      const existDocument: IDocument = await DocumentModel.findOne({
        _id: args.id,
        user: context.user.userID
      });
      if (existDocument) {
        const updatedDoc: IDocument = await DocumentModel.findOneAndUpdate(
          { _id: existDocument._id },
          {
            $set: {
              content: args.content || existDocument.content,
              cache: args.cache || existDocument.cache,
              advancedMode:
                args.advancedMode !== undefined
                  ? args.advancedMode
                  : existDocument.advancedMode
            }
          },
          { new: true }
        );
        pubsub.publish(DOCUMENT_UPDATED, { documentUpdated: updatedDoc });
        return updatedDoc;
      } else {
        return new ApolloError("Document does not exist", "DOCUMENT_NOT_FOUND");
      }
    },

    /**
     * Update document: update information of existing document.
     * It updates the document with the new information provided.
     * args: document ID, new document information.
     */
    updateDocument: async (root: any, args: any, context: any) => {
      const existDocument: IDocument = await DocumentModel.findOne({
        _id: args.id,
        user: context.user.userID
      });
      if (args.input.folder) {
        if (!(await FolderModel.findOne({ _id: args.input.folder }))) {
          throw new ApolloError("Folder does not exist", "FOLDER_NOT_FOUND");
        }
      }
      if (existDocument) {
        if (
          args.input.folder &&
          args.input.folder !== String(existDocument.folder)
        ) {
          await FolderModel.updateOne(
            { _id: args.input.folder }, // modifico los documentsID de la carpeta
            { $push: { documentsID: existDocument._id } }
          );
          await FolderModel.updateOne(
            { _id: existDocument.folder }, // modifico los documentsID de la carpeta donde estaba el documento
            { $pull: { documentsID: existDocument._id } }
          );
        }
        let image: string;
        if (args.input.image) {
          const imageUploaded: IUpload = await uploadDocumentImage(
            //uploadResolver.Mutation.singleUpload(
            args.input.image,
            existDocument._id,
            context.user.userID
          );
          image = imageUploaded.publicUrl;
        } else if (args.input.imageUrl) {
          image = args.input.imageUrl;
        }
        if (args.input.content || args.input.cache) {
          console.log(
            "You should use Update document Content Mutation, USE_UPDATECONTENT_MUTATION"
          );
        }
        const updatedDoc: IDocument = await DocumentModel.findOneAndUpdate(
          { _id: existDocument._id },
          {
            $set: {
              title: args.input.title || existDocument.title,
              type: args.input.type || existDocument.type,
              folder: args.input.folder || existDocument.folder,
              content: args.input.content || existDocument.content,
              advancedMode:
                args.input.advancedMode !== undefined
                  ? args.input.advancedMode
                  : existDocument.advancedMode,
              cache: args.input.cache || existDocument.cache,
              description: args.input.description || existDocument.description,
              version: args.input.version || existDocument.version,
              image: image || existDocument.image
            }
          },
          { new: true }
        );
        loggerController.storeInfoLog(
          "API",
          "document",
          "update",
          existDocument.type,
          existDocument.user,
          ""
        );
        pubsub.publish(DOCUMENT_UPDATED, { documentUpdated: updatedDoc });
        return updatedDoc;
      } else {
        return new ApolloError("Document does not exist", "DOCUMENT_NOT_FOUND");
      }
    },

    /**
     * publish Document: only an admin user can publish a document.
     * A public document is an example file. Once the document is public, every user can see it.
     * args: document id, and public value.
     */
    publishDocument: async (root: any, args: any, context: any) => {
      const docFound: IDocument = await DocumentModel.findOne({ _id: args.id });
      if (!docFound) {
        return new ApolloError("Document does not exist", "DOCUMENT_NOT_FOUND");
      }
      if (args.example && !args.public) {
        return new ApolloError(
          "Example documents must be also public",
          "EXAMPLE_DOCUMENT_MUST_BE_PUBLIC"
        );
      }
      return await DocumentModel.findOneAndUpdate(
        { _id: docFound._id },
        { $set: { public: args.public, example: args.example } },
        { new: true }
      );
    }
  },
  Query: {
    /**
     * Documents: returns all the documents of the user logged.
     * args: nothing.
     */
    documents: async (root: any, args: any, context: any) => {
      return DocumentModel.find({ user: context.user.userID });
    },
    /**
     * Document: returns the information of the document ID provided in the arguments.
     * args: document ID.
     */
    document: async (root: any, args: any, context: any) => {
      if (!args.id || !args.id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new ApolloError("Invalid or missing id", "DOCUMENT_NOT_FOUND");
      }
      const existDocument: IDocument = await DocumentModel.findOne({
        _id: args.id
      });
      if (!existDocument) {
        throw new ApolloError("Document does not exist", "DOCUMENT_NOT_FOUND");
      }
      if (String(existDocument.user) !== context.user.userID) {
        throw new ApolloError(
          "This ID does not belong to one of your documents",
          "NOT_YOUR_DOCUMENT"
        );
      }
      return existDocument;
    },

    /**
     * open public document: returns the information of the public document ID provided in the arguments.
     * args: public document ID.
     */
    openPublicDocument: async (root: any, args: any, context: any) => {
      const existDocument: IDocument = await DocumentModel.findOne({
        _id: args.id,
        public: true
      });
      if (!existDocument) {
        throw new ApolloError("Document does not exist", "DOCUMENT_NOT_FOUND");
      }
      return existDocument;
    },

    /**
     * Examples: returns all the examples in the platform.
     * args: nothing.
     */
    examples: async (root: any, args: any, context: any) => {
      return DocumentModel.find({ example: true });
    },

    /**
     * documentsAndFolders: returns all the documents and folders of the user logged in the order passed as argument.
     * It also returns the total number of pages, the parent folders path of the current location and the number of folders in the current location.
     * args: itemsPerPage: Number, order: String, searchTitle: String.
     */
    documentsAndFolders: async (root: any, args: any, context: any) => {
      const user: IUser = await UserModel.findOne({ _id: context.user.userID });
      if (!user) return new AuthenticationError("You need to be logged in");

      const currentLocation: string = args.currentLocation || user.rootFolder;
      const itemsPerPage: number = args.itemsPerPage || 8;
      let skipN: number = (args.currentPage - 1) * itemsPerPage;
      let limit: number = skipN + itemsPerPage;
      const text: string = args.searchTitle;

      const orderFunction = orderFunctions[args.order];

      const filterOptionsDoc: any = {
        title: { $regex: `.*${text}.*`, $options: "i" },
        user: context.user.userID,
        folder: currentLocation
      };
      const filterOptionsFol: any = {
        name: { $regex: `.*${text}.*`, $options: "i" },
        user: context.user.userID,
        parent: currentLocation
      };

      const docs: IDocument[] = await DocumentModel.find(filterOptionsDoc);
      const fols: IFolder[] = await FolderModel.find(filterOptionsFol);

      const docsParent = await Promise.all(
        docs.map(
          async ({
            title,
            _id: id,
            createdAt,
            updatedAt,
            type,
            folder: parent,
            image,
            ...op
          }) => {
            let hasChildren: boolean = false;
            if ((await ExerciseModel.find({ document: id })).length > 0) {
              hasChildren = true;
            }
            return {
              title,
              id,
              createdAt,
              updatedAt,
              type,
              parent,
              image,
              hasChildren,
              ...op
            };
          }
        )
      );
      const folsTitle = fols.map(
        ({ name: title, _id: id, createdAt, updatedAt, parent, ...op }) => {
          let hasChildren: boolean = false;
          if (
            (op.documentsID && op.documentsID.length > 0) ||
            (op.foldersID && op.foldersID.length > 0)
          ) {
            hasChildren = true;
          }
          return {
            title,
            id,
            createdAt,
            updatedAt,
            type: "folder",
            parent,
            hasChildren,
            ...op
          };
        }
      );

      const allData = [...docsParent, ...folsTitle];
      const allDataSorted = allData.sort(orderFunction);
      const pagesNumber: number = Math.ceil(
        ((await DocumentModel.countDocuments(filterOptionsDoc)) +
          (await FolderModel.countDocuments(filterOptionsFol))) /
          itemsPerPage
      );

      const nFolders: number = await FolderModel.countDocuments({
        user: context.user.userID,
        parent: currentLocation
      });
      const folderLoc = await FolderModel.findOne({ _id: currentLocation });
      const parentsPath = getParentsPath(folderLoc);
      const result = allDataSorted.slice(skipN, limit);
      return {
        result,
        pagesNumber,
        nFolders,
        parentsPath
      };
    }
  },

  Document: {
    exercises: async (document: IDocument) =>
      ExerciseModel.find({ document: document._id }),
    images: async (document: IDocument) =>
      UploadModel.find({ document: document._id }),
    parentsPath: async (document: IDocument) => {
      const parent = await FolderModel.findOne({ _id: document.folder });
      const result = await getParentsPath(parent);
      return result;
    }
  }
};

export default documentResolver;
