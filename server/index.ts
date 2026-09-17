import { app } from "./app";
import { env } from "./env";
import { announceAdminKey } from "./adminAuth";

app.listen(env.port, () => {
  console.log(`Logbook API listening on http://localhost:${env.port}`);
  void announceAdminKey();
});
