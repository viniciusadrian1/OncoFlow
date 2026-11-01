import { criarCloudHandler } from '../server/cloud';

// Vercel Node entrypoint: no listen(), intervals, local files or provisioning.
export default criarCloudHandler();
