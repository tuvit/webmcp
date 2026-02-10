import { extensions } from '@wix/astro/builders';

export default extensions.embeddedScript({
  id: 'webmcp-ecom-script',
  name: 'WebMCP E-commerce Tools',
  placement: 'BODY_END',
  scriptType: 'FUNCTIONAL',
  source: './extensions/site/embedded-scripts/webmcp/webmcp.html',
});
