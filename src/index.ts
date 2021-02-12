import * as core from "@actions/core";
import { createClient } from "contentful-management";
import { runAction } from "./action";
import { MANAGEMENT_API_KEY, SPACE_ID } from "./constants";
import { Logger } from "./utils";

(async () => {
  const client = createClient({
    accessToken: MANAGEMENT_API_KEY,
  });
  const space = await client.getSpace(SPACE_ID);
  try {
    await runAction(space);
  } catch (error) {
    Logger.error(error);
    core.setFailed(error.message);
  }
})();
