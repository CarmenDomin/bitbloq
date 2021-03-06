import {
  ApolloError,
  AuthenticationError,
  withFilter
} from "apollo-server-koa";
import {
  contextController,
  storeTokenInRedis,
  updateExpireDateInRedis
} from "../controllers/context";
import { mailerController } from "../controllers/mailer";
import { getMicrosoftUser, IMSData } from "../controllers/microsoftAuth";
import { DocumentModel, IDocument } from "../models/document";
import { ExerciseModel } from "../models/exercise";
import { FolderModel, IFolder } from "../models/folder";
import { SubmissionModel } from "../models/submission";
import { IUser, UserModel } from "../models/user";

import {
  IEmailData,
  IResetPasswordToken,
  ISignUpToken,
  IUserInToken,
  IDataInRedis
} from "../models/interfaces";
import { redisClient, pubsub } from "../server";

import { sign as jwtSign, verify as jwtVerify } from "jsonwebtoken";
import { hash as bcryptHash, compare as bcryptCompare } from "bcrypt";

import {
  IMutationActivateAccountArgs,
  IMutationSaveUserDataArgs,
  IMutationFinishSignUpArgs,
  IMutationLoginWithMicrosoftArgs,
  IMutationLoginWithGoogleArgs,
  ISessionExpires,
  IMutationUpdateUserDataArgs,
  IMutationUpdateMyPasswordArgs,
  IMutationUpdateMyPlanArgs,
  IMutationSendChangeMyEmailTokenArgs,
  IMutationConfirmChangeEmailArgs,
  IMutationSaveBirthDateArgs,
  IMutationDeleteMyUserArgs,
  IMutationResendWelcomeEmailArgs
} from "../api-types";
import { getGoogleUser, IGoogleData } from "../controllers/googleAuth";
import { IUpload } from "../models/upload";
import { uploadDocumentUserImage } from "./upload";

import {
  generateChangeEmailEmail,
  generateResetPasswordEmail,
  generateWelcomeEmail
} from "../email/generateEmails";

import { SESSION } from "../config";

import { SUBMISSION_SESSION_EXPIRES } from "./submission";
const saltRounds = 7;

export const USER_SESSION_EXPIRES = "USER_SESSION_EXPIRES";

const userResolver = {
  Subscription: {
    userSessionExpires: {
      subscribe: withFilter(
        // Filtra para devolver solo los documentos del usuario
        () => pubsub.asyncIterator([USER_SESSION_EXPIRES]),
        (
          payload: {
            userSessionExpires: ISessionExpires;
          },
          variables,
          context: { user: IUserInToken }
        ) => {
          return (
            String(context.user.userID) ===
            String(payload.userSessionExpires.key)
          );
        }
      )
    }
  },

  Mutation: {
    // Public mutations:

    /**
     * Save user: register the data of a new uer.
     * It saves the new user data if the email passed as argument is not registered yet.
     * args: email, password and user information.
     */
    saveUserData: async (_, args: IMutationSaveUserDataArgs) => {
      if (!args.input.email) {
        throw new ApolloError("Email required", "EMAIL_REQUIRED");
      }
      const contactFound: IUser | null = await UserModel.findOne({
        email: args.input.email
      });
      if (contactFound) {
        if (contactFound.finishedSignUp) {
          throw new ApolloError(
            "This user already exists",
            "USER_EMAIL_EXISTS"
          );
        } else {
          await UserModel.deleteOne({ _id: contactFound._id }); // Delete every data of the user
        }
      }
      // Store the password with a hash
      const hash: string = await bcryptHash(
        args.input.password as string,
        saltRounds as number
      );
      const birthDate: string[] = String(args.input.birthDate).split("/");
      const userNew: IUser = new UserModel({
        email: args.input.email,
        password: hash,
        name: args.input.name,
        surnames: args.input.surnames,
        birthDate: new Date(
          Number(birthDate[2]),
          Number(birthDate[1]) - 1,
          Number(birthDate[0])
        ),
        active: false,
        authToken: " ",
        notifications: args.input.notifications,
        imTeacherCheck: args.input.imTeacherCheck,
        centerName: args.input.centerName,
        educationalStage: args.input.educationalStage,
        city: args.input.city,
        postCode: args.input.postCode,
        country: args.input.country,
        lastLogin: new Date(),
        finishedSignUp: false
      });
      const newUser: IUser = await UserModel.create(userNew);
      const idToken: string = await jwtSign(
        {
          saveUserData: newUser._id
        },
        process.env.JWT_SECRET || "",
        { expiresIn: "15m" }
      );
      return { id: idToken, email: newUser.email };
    },

    /**
     * Finish sign up: checks if the user id passed as argument is registered in platform
     * and update the user plan.
     * It sends a e-mail to activate the account.
     * args: userID and plan selected("member" or "teacher").
     */
    finishSignUp: async (_, args: IMutationFinishSignUpArgs) => {
      const idInfo = ((await jwtVerify(
        args.id,
        process.env.JWT_SECRET || ""
      )) as unknown) as { saveUserData: string };
      if (!idInfo.saveUserData) {
        throw new ApolloError("User ID not valid", "ID_NOT_VALID");
      }
      const user: IUser | null = await UserModel.findOne({
        _id: idInfo.saveUserData,
        active: false
      });
      if (!user) {
        return new ApolloError(
          "User does not exist or activated.",
          "USER_NOT_FOUND"
        );
      }
      if (!user.birthDate) {
        return new ApolloError(
          "User has not birth date saved.",
          "USER_NOT_BIRTHDATE"
        );
      }
      let teacher = false;
      switch (args.userPlan) {
        case "teacher":
          teacher = true;
          break;
        case "member":
          break;
        default:
          throw new ApolloError("User plan is not valid", "PLAN_NOT_FOUND");
      }
      // Create user root folder for documents
      const userFolder: IFolder = await FolderModel.create({
        name: "root",
        user: user._id
      });

      let activeUser = false;
      let logOrSignToken = "";
      if (user.microsoftID || user.googleID) {
        activeUser = true;
        const { token, role } = await contextController.generateLoginToken(
          user
        );
        logOrSignToken = token;
        await storeTokenInRedis(user._id, token);
      } else {
        logOrSignToken = jwtSign(
          {
            signUpUserID: user._id
          },
          process.env.JWT_SECRET || ""
        );
        // Generate the email with the activation link and send it
        const data: IEmailData = {
          url: `${process.env.FRONTEND_URL}/signup/activate?token=${logOrSignToken}`
        };
        const emailContent: string = await generateWelcomeEmail(data);
        if (emailContent) {
          await mailerController.sendEmail(
            user.email!,
            "Bitbloq cuenta creada",
            emailContent
          );
        }
      }

      // Update the user information in the database
      await UserModel.findOneAndUpdate(
        { _id: user._id },
        {
          $set: {
            signUpToken:
              user.microsoftID || user.googleID ? "" : logOrSignToken,
            authToken: user.microsoftID || user.googleID ? logOrSignToken : "",
            teacher,
            finishedSignUp: true,
            rootFolder: userFolder._id,
            active: activeUser
          }
        },
        { new: true }
      );
      return user.microsoftID || user.googleID ? logOrSignToken : "";
    },

    /**
     * resendWelcomeEmail: Sends the welcome email to the user when the user request it
     * args: email
     */
    resendWelcomeEmail: async (_, args: IMutationResendWelcomeEmailArgs) => {
      const { email } = args;
      const user: IUser | null = await UserModel.findOne({
        email,
        active: false
      });
      if (!user) {
        throw new ApolloError("Email or password incorrect", "LOGIN_ERROR");
      }

      const logOrSignToken = jwtSign(
        {
          signUpUserID: user._id
        },
        process.env.JWT_SECRET || ""
      );

      // Update the user information in the database
      await UserModel.findOneAndUpdate(
        { _id: user._id },
        {
          $set: {
            signUpToken: logOrSignToken,
            authToken: logOrSignToken
          }
        },
        { new: true }
      );

      // Generate the email with the activation link and send it
      const data: IEmailData = {
        url: `${process.env.FRONTEND_URL}/signup/activate?token=${logOrSignToken}`
      };

      const emailContent: string = await generateWelcomeEmail(data);
      if (emailContent) {
        await mailerController.sendEmail(
          user.email!,
          "Bitbloq cuenta creada",
          emailContent
        );
        return true;
      } else {
        return false;
      }
    },

    /**
     * saveBirthDate: Saves birthDate for signup with google or microsoft
     * args: user id and birthDate
     */

    saveBirthDate: async (_, args: IMutationSaveBirthDateArgs) => {
      const idInfo = ((await jwtVerify(
        args.id,
        process.env.JWT_SECRET || ""
      )) as unknown) as { saveUserData: string };
      if (!idInfo || !idInfo.saveUserData) {
        throw new ApolloError("User ID not valid", "ID_NOT_VALID");
      }
      const user: IUser | null = await UserModel.findOne({
        _id: idInfo.saveUserData,
        active: false,
        finishedSignUp: false
      });
      if (!user) {
        return new ApolloError(
          "User does not exist or activated 1.",
          "USER_NOT_FOUND"
        );
      }
      const birthDate: string[] = String(args.birthDate).split("/");
      try {
        const { token } = await contextController.generateLoginToken(user);
        await storeTokenInRedis(user._id, token);
        await UserModel.findOneAndUpdate(
          { _id: idInfo.saveUserData, finishedSignUp: false, active: false },
          {
            $set: {
              birthDate: new Date(
                Number(birthDate[2]),
                Number(birthDate[1]) - 1,
                Number(birthDate[0])
              )
            }
          },
          { new: true }
        );
        return { id: user.id, email: user.email };
      } catch (e) {
        return new ApolloError(
          "User does not exist or activated 2.",
          "USER_NOT_FOUND"
        );
      }
    },

    /*
      Login: login with a registered user.
      It returns the authorization token with user information.
      args: email and password.
    */
    login: async (_, { email, password }) => {
      const contactFound: IUser | null = await UserModel.findOne({
        email,
        finishedSignUp: true
      });
      if (!contactFound) {
        throw new ApolloError("Email or password incorrect", "LOGIN_ERROR");
      }
      if (!contactFound.active) {
        throw new ApolloError(
          "Not active user, please activate your account",
          "NOT_ACTIVE_USER"
        );
      }
      // Compare passwords from request and database
      const valid: boolean = await bcryptCompare(
        password,
        contactFound.password
      );
      if (valid) {
        const { token, role } = await contextController.generateLoginToken(
          contactFound
        );
        if (!contactFound.rootFolder) {
          const userDocs: IDocument[] = await DocumentModel.find({
            user: contactFound._id
          });
          const userFols: IFolder[] = await FolderModel.find({
            user: contactFound._id
          });
          const userFolder: IFolder = await FolderModel.create({
            name: "root",
            user: contactFound._id,
            documentsID: userDocs.map(i => i._id),
            foldersID: userFols.map(i => i._id)
          });
          await DocumentModel.updateMany(
            { user: contactFound._id },
            { $set: { parentFolder: userFolder._id } }
          );
          await FolderModel.updateMany(
            { user: contactFound._id, name: { $ne: "root" } },
            { $set: { parentFolder: userFolder._id } }
          );
          await UserModel.updateOne(
            { _id: contactFound._id },
            { $set: { rootFolder: userFolder._id } },
            { new: true }
          );
        }
        await storeTokenInRedis(contactFound._id, token);
        // Update the user information in the database
        await UserModel.updateOne(
          { _id: contactFound._id },
          { $set: { authToken: token, lastLogin: new Date() } },
          { new: true }
        );
        return token;
      } else {
        throw new ApolloError("Email or password incorrect", "LOGIN_ERROR");
      }
    },

    /**
     * loginWithGoogle: login into platform with google account. If it is the first time, stores user data. If not, just login user.
     * args: google token
     */
    loginWithGoogle: async (
      _,
      args: IMutationLoginWithGoogleArgs,
      context: any
    ) => {
      let idToken = "";
      let finishedSignUp: boolean | undefined;
      let token = "";
      const userData: IGoogleData = await getGoogleUser(args.token);
      if (!userData) {
        throw new ApolloError("Not valid token", "NOT_VALID_TOKEN");
      }
      let user: IUser | null = await UserModel.findOne({
        email: userData.email
      });
      if (user && (!user.finishedSignUp || !user.active)) {
        await UserModel.deleteOne({ _id: user._id }); // Delete every data of the user
        user = null;
      }
      if (!user) {
        // guardar datos de usuario
        user = await UserModel.create({
          password: "google",
          googleID: userData.id || "google",
          name: userData.given_name || userData.email,
          surnames: userData.family_name || "google",
          email: userData.email,
          active: false,
          authToken: " ",
          notifications: false,
          imTeacherCheck: false,
          lastLogin: new Date(),
          finishedSignUp: false,
          socialLogin: true
        } as IUser);
        finishedSignUp = user.finishedSignUp;
        idToken = await jwtSign(
          {
            saveUserData: user._id
          },
          process.env.JWT_SECRET || "",
          { expiresIn: "15m" }
        );
      } else {
        // usuario se logea sin más
        token = (await contextController.generateLoginToken(user)).token;
        finishedSignUp = user.finishedSignUp;
        await UserModel.updateOne(
          { _id: user._id },
          { $set: { authToken: token, lastLogin: new Date() } },
          { new: true }
        );
        await storeTokenInRedis(user._id, token);
      }

      return { id: idToken, finishedSignUp, token };
    },

    /**
     * loginWithMicrosoft: ask microsoft for user data and logs him
     * args: microsoft token
     */
    loginWithMicrosoft: async (
      _,
      args: IMutationLoginWithMicrosoftArgs,
      ___
    ) => {
      let idToken = "";
      let finishedSignUp: boolean | undefined;
      let token = "";
      const userData: IMSData = await getMicrosoftUser(args.token);
      if (!userData) {
        throw new ApolloError("Not valid token", "NOT_VALID_TOKEN");
      }
      let user: IUser | null = await UserModel.findOne({
        email: userData.userPrincipalName
      });
      if (user && (!user.finishedSignUp || !user.active)) {
        await UserModel.deleteOne({ _id: user._id }); // Delete every data of the user
        user = null;
      }
      if (!user) {
        // guardar datos de usuario
        user = await UserModel.create({
          password: "microsoft",
          microsoftID: userData.id || "microsoft",
          name: userData.givenName || userData.userPrincipalName,
          surnames: userData.surname || "microsoft",
          email: userData.userPrincipalName,
          active: false,
          authToken: " ",
          notifications: false,
          imTeacherCheck: false,
          lastLogin: new Date(),
          finishedSignUp: false,
          socialLogin: true
        } as IUser);
        finishedSignUp = user.finishedSignUp;
        idToken = await jwtSign(
          {
            saveUserData: user._id
          },
          process.env.JWT_SECRET || "",
          { expiresIn: "15m" }
        );
      } else {
        // usuario se logea sin más
        token = (await contextController.generateLoginToken(user)).token;
        finishedSignUp = user.finishedSignUp;
        await UserModel.updateOne(
          { _id: user._id },
          { $set: { authToken: token, lastLogin: new Date() } },
          { new: true }
        );
        await storeTokenInRedis(user._id, token);
      }
      return { id: idToken, finishedSignUp, token };
    },

    /*
     * renewSession: updates expire date token in redis
     */
    renewSession: async (_, __, context: any) => {
      // authorization for queries and mutations
      const token1: string = context.headers.authorization || "";
      const justToken: string = token1.split(" ")[1];
      const data:
        | IUserInToken
        | undefined = ((await contextController.getDataInToken(
        justToken
      )) as unknown) as IUserInToken;

      if (data && String(process.env.USE_REDIS) === "true") {
        const now: Date = new Date();
        let secondsRemaining = 0;
        if (data.userID) {
          await updateExpireDateInRedis(data.userID, false);
          const result: IDataInRedis = await redisClient.hgetallAsync(
            data.userID
          );
          const expiresAt: Date = new Date(result.expiresAt);
          secondsRemaining = (expiresAt.getTime() - now.getTime()) / 1000;
          pubsub.publish(USER_SESSION_EXPIRES, {
            userSessionExpires: {
              ...result,
              key: data.userID,
              secondsRemaining,
              expiredSession: false,
              showSessionWarningSecs: SESSION.SHOW_WARNING_SECONDS
            }
          });
        } else if (data.submissionID) {
          await updateExpireDateInRedis(data.submissionID, true);
          const result: IDataInRedis = await redisClient.hgetallAsync(
            data.submissionID
          );
          const expiresAt: Date = new Date(result.expiresAt);
          secondsRemaining = (expiresAt.getTime() - now.getTime()) / 1000;
          pubsub.publish(SUBMISSION_SESSION_EXPIRES, {
            submissionSessionExpires: {
              ...result,
              key: data.submissionID,
              secondsRemaining,
              expiredSession: false,
              showSessionWarningSecs: SESSION.SHOW_WARNING_SECONDS
            }
          });
        }
        return "OK";
      }
      throw new ApolloError("Not data in token", "TOKEN_NOT_VALID");
    },

    /**
     * reset Password: send a email to the user email with a new token for edit the password.
     * args: email
     */
    sendForgotPasswordEmail: async (_, { email }) => {
      const contactFound: IUser | null = await UserModel.findOne({
        email,
        finishedSignUp: true
      });
      if (!contactFound) {
        throw new ApolloError("Email or password incorrect", "LOGIN_ERROR");
      }
      const token: string = jwtSign(
        {
          resetPassUserID: contactFound._id
        },
        process.env.JWT_SECRET || "",
        { expiresIn: "30m" }
      );
      const index = `resPass-${contactFound._id}`;
      await storeTokenInRedis(index, token);

      // Generate the email with the activation link and send it
      const data: IEmailData = {
        url: `${process.env.FRONTEND_URL}/reset-password?token=${token}`
      };
      const emailContent: string = await generateResetPasswordEmail(data);
      if (emailContent) {
        await mailerController.sendEmail(
          contactFound.email!,
          "Cambiar contraseña Bitbloq",
          emailContent
        );
      }
      return "OK";
    },

    checkForgotPasswordToken: async (_, { token }) => {
      await getResetPasswordData(token);
      return true;
    },

    /**
     * edit Password: stores the new password passed as argument in the database
     * You can only use this method if the token provided is the one created in the sendForgotPasswordEmail mutation
     * args: token, new Password
     */
    updateForgotPassword: async (_, { token, newPassword }) => {
      const dataInToken = ((await getResetPasswordData(
        token
      )) as unknown) as IResetPasswordToken;

      const contactFound: IUser | null = await UserModel.findOne({
        _id: (dataInToken.resetPassUserID as unknown) as string,
        finishedSignUp: true
      });

      if (!contactFound) {
        throw new ApolloError(
          "Error with reset password token",
          "USER_NOT_FOUND"
        );
      }
      // Store the password with a hash
      const hash: string = await bcryptHash(newPassword, saltRounds);
      const { token: authToken } = await contextController.generateLoginToken(
        contactFound
      );

      await UserModel.findOneAndUpdate(
        { _id: contactFound._id },
        {
          $set: {
            password: hash,
            authToken
          }
        }
      );

      if (String(process.env.USE_REDIS) === "true") {
        redisClient.del(`resPass-${contactFound._id}`);
      }

      await storeTokenInRedis(contactFound._id, authToken);
      return authToken;
    },

    /*
      Activate Account: activates the new account of the user registered.
      It takes the information of the token received and activates the account created before.
      args: sign up token. This token is provided in the email sent.
    */
    activateAccount: async (_, args: IMutationActivateAccountArgs) => {
      if (!args.token) {
        throw new ApolloError(
          "Error with sign up token, no token in args",
          "NOT_TOKEN_PROVIDED"
        );
      }
      const userInToken = ((await contextController.getDataInToken(
        args.token
      )) as unknown) as ISignUpToken;

      const contactFound: IUser | null = await UserModel.findOne({
        _id: (userInToken.signUpUserID as unknown) as string,
        active: false,
        finishedSignUp: true
      });

      if (!contactFound) {
        throw new ApolloError("User not found", "USER_NOT_FOUND");
      }

      if (contactFound.signUpToken !== args.token) {
        throw new ApolloError("Token not valid", "TOKEN_NOT_VALID");
      }

      if (userInToken.signUpUserID && !contactFound.active) {
        const { token } = await contextController.generateLoginToken(
          contactFound
        );
        await UserModel.findOneAndUpdate(
          { _id: contactFound._id },
          {
            $set: {
              active: true,
              authToken: token,
              signUpToken: " "
            }
          }
        );
        await storeTokenInRedis(contactFound._id, token);
        return token;
      } else {
        return new ApolloError(
          "Error with sign up token, try again",
          "TOKEN_NOT_VALUE"
        );
      }
    },

    /**
     * Delete user: delete own user.
     * It deletes the user passed by the ID if it is the same as the passed by token.
     * This method deletes all the documents, exercises and submissions related with this user.
     * args: user ID.
     */
    deleteMyUser: async (
      _,
      args: IMutationDeleteMyUserArgs,
      context: { user: IUserInToken }
    ) => {
      const user: IUser | null = await UserModel.findOne({
        _id: context.user.userID,
        finishedSignUp: true,
        active: true
      });
      if (!user) {
        throw new ApolloError("User not found", "USER_NOT_FOUND");
      }
      const valid: boolean = await bcryptCompare(args.password, user.password);
      if (!valid) {
        throw new ApolloError("Password incorrect", "PASSWORD_INCORRECT");
      }
      await Promise.all([
        SubmissionModel.deleteMany({ user: user._id }),
        ExerciseModel.deleteMany({ user: user._id }),
        DocumentModel.deleteMany({ user: user._id, public: false }),
        FolderModel.deleteMany({ user: user._id }),
        UserModel.deleteOne({ _id: user._id })
      ]);
      return "OK";
    },

    /**
     * Update user data: update existing user data.
     * It updates the user with the new information provided.
     * args: user ID, new user information: name, surnames, birthDate and avatar file.
     */
    updateUserData: async (
      _,
      args: IMutationUpdateUserDataArgs,
      context: { user: IUserInToken }
    ) => {
      const contactFound: IUser | null = await UserModel.findOne({
        _id: args.id,
        finishedSignUp: true
      });

      if (
        !contactFound ||
        String(contactFound._id) !== String(context.user.userID)
      ) {
        throw new ApolloError("User not found", "USER_NOT_FOUND");
      }

      let image: string | undefined;
      if (args.input.avatar) {
        const imageUploaded: IUpload = await uploadDocumentUserImage(
          args.input.avatar,
          context.user.userID
        );
        image = imageUploaded.publicUrl;
      }
      return UserModel.findOneAndUpdate(
        { _id: contactFound._id },
        {
          $set: {
            name: args.input.name || contactFound.name,
            surnames: args.input.surnames || contactFound.surnames,
            birthDate: args.input.birthDate || contactFound.birthDate,
            avatar: image || contactFound.avatar
          }
        },
        { new: true }
      );
    },

    /**
     * updateMyPassword: updates my own password with user logged.
     * args: currentPassword and newPassword
     */
    updateMyPassword: async (
      _,
      args: IMutationUpdateMyPasswordArgs,
      context: { user: IUserInToken }
    ) => {
      const contactFound: IUser | null = await UserModel.findOne({
        _id: context.user.userID
      });
      if (!contactFound) {
        throw new ApolloError("User not found", "USER_NOT_FOUND");
      }
      const valid: boolean = await bcryptCompare(
        args.currentPassword,
        contactFound.password
      );
      if (valid) {
        // Store the password with a hash
        const hash: string = await bcryptHash(
          args.newPassword as string,
          saltRounds as number
        );
        return UserModel.findOneAndUpdate(
          { _id: contactFound._id },
          { $set: { password: hash } },
          { new: true }
        );
      } else {
        throw new ApolloError("Password incorrect", "INCORRECT_PASSWORD");
      }
    },

    /**
     * updateMyPlan: mutation to update my user plan in accounts page.
     * args: new User Plan
     */
    updateMyPlan: async (
      _,
      args: IMutationUpdateMyPlanArgs,
      context: { user: IUserInToken }
    ) => {
      let teacher = false;
      switch (args.userPlan) {
        case "teacher":
          teacher = true;
          break;
        case "member":
          break;
        default:
          throw new ApolloError("User plan is not valid", "PLAN_NOT_FOUND");
      }
      const user: IUser | null = await UserModel.findOneAndUpdate(
        { _id: context.user.userID, finishedSignUp: true },
        { $set: { teacher } },
        { new: true }
      );
      if (!user) {
        throw new ApolloError("User not found", "USER_NOT_FOUND");
      }
      const { token } = await contextController.generateLoginToken(user);
      await UserModel.updateOne(
        { _id: user!._id },
        { $set: { authToken: token, lastLogin: new Date() } },
        { new: true }
      );
      await storeTokenInRedis(user!._id, token);
      return token;
    },

    /**
     * sendChangeMyEmailToken: first mutation to update my email in account page.
     * It sends a new Email with a token like in create account process.
     * args: new User Email
     */
    sendChangeMyEmailToken: async (
      _,
      args: IMutationSendChangeMyEmailTokenArgs,
      context: { user: IUserInToken }
    ) => {
      const contactFound: IUser | null = await UserModel.findOne({
        _id: context.user.userID,
        finishedSignUp: true
      });
      if (!contactFound) {
        throw new ApolloError("User not found", "USER_NOT_FOUND");
      }
      const existsNewMail: IUser | null = await UserModel.findOne({
        email: args.newEmail
      });
      if (existsNewMail) {
        throw new ApolloError("Email already exists", "EMAIL_EXISTS");
      }
      const token: string = jwtSign(
        {
          changeEmailUserID: contactFound._id,
          changeEmailNewEmail: args.newEmail
        },
        process.env.JWT_SECRET || "",
        { expiresIn: "30m" }
      );
      await storeTokenInRedis(`changeEmail-${contactFound._id}`, token);
      // Generate the email with the activation link and send it
      const data: IEmailData = {
        url: `${process.env.FRONTEND_URL}/app/account/change-email?token=${token}`
      };
      const emailContent: string = await generateChangeEmailEmail(data);
      if (emailContent) {
        await mailerController.sendEmail(
          args.newEmail!,
          "Bitbloq cambiar correo electrónico",
          emailContent
        );
      }
      return "OK";
    },

    /**
     * checkTokenChangeEmail: checks token before show change email page
     */
    checkTokenChangeEmail: async (_, { token }) => {
      let userInToken: {
        changeEmailUserID: string;
        changeEmailNewEmail: string;
      };
      let redisToken = "";
      try {
        userInToken = ((await jwtVerify(
          token,
          process.env.JWT_SECRET || ""
        )) as unknown) as {
          changeEmailUserID: string;
          changeEmailNewEmail: string;
        };
        if (String(process.env.USE_REDIS) === "true") {
          redisToken = (
            await redisClient.hgetallAsync(
              `changeEmail-${userInToken.changeEmailUserID}`
            )
          ).authToken;
          return redisToken === token;
        }
        return false;
      } catch (e) {
        throw new ApolloError("Token not valid", "TOKEN_NOT_VALID");
      }
    },

    /**
     * confirmChangeEmail: second mutation to update my email in account page.
     * It checks the token and stores the new email. It returns the login token updated.
     * args: token sent to user
     */
    confirmChangeEmail: async (
      _,
      args: IMutationConfirmChangeEmailArgs,
      __
    ) => {
      let userInToken: {
        changeEmailUserID: string;
        changeEmailNewEmail: string;
      };
      let redisToken = "";
      try {
        userInToken = ((await jwtVerify(
          args.token,
          process.env.JWT_SECRET || ""
        )) as unknown) as {
          changeEmailUserID: string;
          changeEmailNewEmail: string;
        };
        if (String(process.env.USE_REDIS) === "true") {
          redisToken = (
            await redisClient.hgetallAsync(
              `changeEmail-${userInToken.changeEmailUserID}`
            )
          ).authToken;
        }
      } catch (e) {
        throw new ApolloError("Token not valid", "TOKEN_NOT_VALID");
      }
      let user: IUser | null;
      user = await UserModel.findOne({ _id: userInToken.changeEmailUserID });
      if (!user) {
        throw new ApolloError("User not found", "USER_NOT_FOUND");
      }
      const valid: boolean = await bcryptCompare(args.password, user.password);
      if (!valid) {
        throw new ApolloError("Password incorrect", "PASSWORD_INCORRECT");
      }
      if (redisToken === args.token) {
        try {
          user = await UserModel.findOneAndUpdate(
            { _id: userInToken.changeEmailUserID },
            { $set: { email: userInToken.changeEmailNewEmail } },
            { new: true }
          );
        } catch (e) {
          throw new ApolloError("Email already exists", "EMAIL_EXISTS");
        }
        await redisClient.del(`changeEmail-${userInToken.changeEmailUserID}`);
        const { token } = await contextController.generateLoginToken(user);
        await UserModel.updateOne(
          { _id: user!._id },
          { $set: { authToken: token, lastLogin: new Date() } },
          { new: true }
        );
        await storeTokenInRedis(user!._id, token);
        return token;
      } else {
        throw new ApolloError("Token not valid", "TOKEN_NOT_VALID");
      }
    }
  },

  Query: {
    /**
     *  Me: returns the information of the user provided in the authorization token.
     *  args: nothing.
     */
    me: async (_, __, context: { user: IUserInToken }) => {
      const contactFound: IUser | null = await UserModel.findOne({
        email: context.user.email,
        _id: context.user.userID
      });
      if (!contactFound) {
        return new ApolloError("Error with user in context", "USER_NOT_FOUND");
      }
      return contactFound;
    },

    /**
     *  Users: returns all the users in the platform. It can be executed only by admin user.
     *  args: nothing.
     */
    users() {
      return UserModel.find({});
    }
  },

  User: {
    documents: async (user: IUser) => DocumentModel.find({ user: user._id })
  }
};

const getResetPasswordData = async (token: string) => {
  if (!token) {
    throw new ApolloError(
      "Error with reset password token, no token in args",
      "INVALID_TOKEN"
    );
  }
  let dataInToken: IResetPasswordToken;

  try {
    dataInToken = ((await contextController.getDataInToken(
      token
    )) as unknown) as IResetPasswordToken;
  } catch (e) {
    throw new ApolloError(
      "The provided token is not valid or has expired",
      "INVALID_TOKEN"
    );
  }

  if (String(process.env.USE_REDIS) === "true") {
    const storedToken = await redisClient.hgetallAsync(
      `resPass-${dataInToken.resetPassUserID}`
    );
    if (storedToken.authToken !== token) {
      throw new ApolloError(
        "The provided token is not the latest one",
        "INVALID_TOKEN"
      );
    }
  }

  return dataInToken;
};

export default userResolver;
