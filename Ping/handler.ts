import * as express from "express";
import { wrapRequestHandler } from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseSuccessAccepted,
  ResponseSuccessAccepted
} from "italia-ts-commons/lib/responses";

type PingHandler = () => Promise<IResponseSuccessAccepted>;

export function PingHandler(): PingHandler {
  return async () => ResponseSuccessAccepted();
}

export function Ping(): express.RequestHandler {
  const handler = PingHandler();

  return wrapRequestHandler(handler);
}
