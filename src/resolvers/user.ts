import { userController } from '../controllers/user';
import { DocumentModelController } from '../controllers/document';
import { ExerciseModelController } from '../controllers/exercise';
import { SubmissionModelController } from '../controllers/submission';
import { UserModel } from '../models/user';
import { contextController } from '../controllers/context';
import { AuthenticationError } from 'apollo-server-koa';
import { ObjectID } from 'bson';
const bcrypt = require('bcrypt');
const jsonwebtoken = require('jsonwebtoken');

const saltRounds = 7;

const userResolver = {
  Mutation: {
    //public methods:

    async signUpUser(root: any, args: any) {
      console.log(args);
      const contactFound = await UserModel.findOne({
        email: args.input.email,
      });
      if (contactFound) {
        throw new Error('This user already exists');
      }
      //Store the password with a hash
      const hash: String = await bcrypt.hash(args.input.password, saltRounds);
      const token: String = jsonwebtoken.sign(
        {
          email: args.input.email,
          password: hash,
          signUp: true,
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' },
      );
      const user_new = new UserModel({
        id: ObjectID,
        email: args.input.email,
        password: hash,
        name: args.input.name,
        center: args.input.center,
        active: false,
        signUpToken: token,
        authToken: ' ',
        notifications: args.input.notifications,
      });
      console.log(token);
      userController.signUpUser(user_new);
      return token;
    },

    async login(root: any, { email, password }) {
      const contactFound = await UserModel.findOne({ email });
      if (!contactFound) {
        throw new Error('Contact not found or password incorrect');
      }
      if (!contactFound.active) {
        throw new Error('Not active user, please activate your account');
      }
      //Compare passwords from request and database
      const valid: Boolean = await bcrypt.compare(
        password,
        contactFound.password,
      );
      if (valid) {
        const token: String = jsonwebtoken.sign(
          {
            email: contactFound.email,
            id: contactFound._id,
            signUp: false,
          },
          process.env.JWT_SECRET,
          { expiresIn: '1h' },
        );
        userController.updateUser(contactFound._id, { authToken: token });
        return token;
      } else {
        throw new Error('comparing passwords valid=false');
      }
    },

    //private methods:

    async activateAccount(root: any, args: any, context: any) {
      if (!args.token)
        throw new Error('Error with sign up token, no token in args');
      const userInToken = await contextController.getDataInToken(args.token);
      const contactFound = await UserModel.findOne({
        email: userInToken.email,
      });
      if (userInToken.signUp && !contactFound.active) {
        var token: String = jsonwebtoken.sign(
          { email: contactFound.email, password: contactFound.password },
          process.env.JWT_SECRET,
          { expiresIn: '1h' },
        );
        userController.updateUser(contactFound._id, {
          active: true,
          authToken: token,
          signUpToken: ' ',
        });
        return token;
      } else {
        return new Error('Error with sign up token, try again');
      }
    },

    async deleteUser(root: any, args: any, context: any) {
      if (!context.user)
        throw new AuthenticationError('You need to be logged in');
      if (context.user.signUp)
        throw new Error('Problem with token, not auth token');
      const contactFound = await UserModel.findOne({
        email: context.user.email,
      });
      if (contactFound._id == args.id) {
        SubmissionModelController.deleteManySubs(contactFound._id);
        ExerciseModelController.deleteManyExs(contactFound._id);
        DocumentModelController.deleteManyDocs(contactFound._id); // Delete all the user's documents
        return userController.deleteUser(contactFound._id); //Delete the user
      } else {
        throw new Error('Cant deleteUser');
      }
    },

    async updateUser(root: any, args: any, context: any, input: any) {
      if (!context.user)
        throw new AuthenticationError('You need to be logged in');
      if (context.user.signUp)
        throw new Error('Problem with token, not auth token');
      const contactFound = await UserModel.findOne({
        email: context.user.email,
      });
      if (contactFound._id == args.id) {
        const data = args.input;
        return userController.updateUser(contactFound._id, data);
      } else {
        return new Error('User doesnt exist');
      }
    },
  },

  Query: {
    async me(root: any, args: any, context: any) {
      console.log(context);
      if (!context.user)
        throw new AuthenticationError('You need to be logged in');
      const contactFound = await UserModel.findOne({
        email: context.user.email,
      });
      if (!contactFound) return new Error('Error with user in context');
      return contactFound;
    },
    users(root: any, args: any, context: any) {
      console.log(context);
      if (!context.user)
        throw new AuthenticationError('You need to be logged in');
      if (context.user.signUp)
        throw new Error('Problem with token, not auth token');
      return userController.findAllUsers();
    },
  },
};

export default userResolver;
