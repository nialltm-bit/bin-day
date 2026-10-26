import { statusMessage } from "./status";

const status = document.getElementById("status");
if (status) {
  status.textContent = statusMessage();
}
