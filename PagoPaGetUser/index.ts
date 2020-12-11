import * as express from "express";
import * as winston from "winston";

import { Context } from "@azure/functions";
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "io-functions-commons/dist/src/models/profile";
import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import * as passport from "passport";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import {
  createClusterRedisClient,
  createSimpleRedisClient
} from "../utils/redis";
import SessionStorage from "../utils/sessionStorage";
import bearerWalletTokenStrategy from "../utils/strategy";
import { PagoPaGetUser } from "./handler";

//
//  CosmosDB initialization
//

const config = getConfigOrThrow();

// tslint:disable-next-line: no-let
let logger: Context["log"] | undefined;
const contextTransport = new AzureContextTransport(() => logger, {
  level: "debug"
});
winston.add(contextTransport);

const REDIS_CLIENT = !config.isProduction
  ? createSimpleRedisClient(config.REDIS_URL)
  : createClusterRedisClient(
      config.REDIS_URL,
      config.REDIS_PASSWORD,
      config.REDIS_PORT
    );
const sessionStorage = new SessionStorage(REDIS_CLIENT);

const profileModel = new ProfileModel(
  cosmosdbClient
    .database(config.COSMOSDB_API_NAME)
    .container(PROFILE_COLLECTION_NAME)
);

// Setup Express
const app = express();
secureExpressApp(app);

passport.use("bearer.wallet", bearerWalletTokenStrategy(sessionStorage));
const walletBearerAuth = passport.authenticate("bearer.wallet", {
  session: false
});

// Add express route
app.get(
  "/api/v1/user",
  walletBearerAuth,
  PagoPaGetUser(profileModel, sessionStorage, config.ENABLE_NOTICE_EMAIL_CACHE)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
