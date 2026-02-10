import { app } from '@wix/astro/builders';
import myPage from './extensions/dashboard/pages/my-page/my-page.extension.ts';
import webmcpEcom from './extensions/site/embedded-scripts/webmcp/webmcp.extension.ts';

export default app()
  .use(myPage)
  .use(webmcpEcom)
