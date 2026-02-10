import { app } from '@wix/astro/builders';
import webmcpTools from './extensions/site/embedded-scripts/webmcp/webmcp.extension.ts';
import dashboardPage from './extensions/dashboard/pages/enable-webmcp/enable-webmcp.extension.ts';

export default app()
  .use(webmcpTools)
  .use(dashboardPage)
