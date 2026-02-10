import { extensions } from '@wix/astro/builders';

export default extensions.embeddedScript({
  id: '896c211c-13c5-4977-b4aa-f08c0f9a7a12',
  name: 'WebMCP Site Tools',
  placement: 'BODY_END',
  scriptType: 'ESSENTIAL',
  source: './extensions/site/embedded-scripts/webmcp/webmcp.html',
});
