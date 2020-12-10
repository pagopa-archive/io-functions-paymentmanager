import { AzureFunction, Context } from "@azure/functions";
import * as express from "express";
import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";
import { Ping } from "./handler";

// Setup Express
const app = express();
secureExpressApp(app);

// Add express route
app.head("/api/v1/ping", Ping());

const azureFunctionHandler = createAzureFunctionHandler(app);

const httpStart: AzureFunction = (context: Context): void => {
  setAppContext(app, context);
  azureFunctionHandler(context);
};

export default httpStart;