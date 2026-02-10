import { useState } from 'react';
import { Button, Page, Card, Box, Text, WixDesignSystemProvider } from '@wix/design-system';
import { embeddedScripts } from '@wix/app-management';
import '@wix/design-system/styles.global.css';

const EMBEDDED_SCRIPT_COMPONENT_ID = '896c211c-13c5-4977-b4aa-f08c0f9a7a12';

export default function EnableWebMCP() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleEnable = async () => {
    setStatus('loading');
    setErrorMessage('');

    try {
      await embeddedScripts.embedScript({
        componentId: EMBEDDED_SCRIPT_COMPONENT_ID,
        parameters: {},
      });
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to enable WebMCP');
    }
  };

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="WebMCP"
          subtitle="Enable AI tools for your site"
        />
        <Page.Content>
          <Card>
            <Card.Header title="Enable WebMCP on Your Site" />
            <Card.Divider />
            <Card.Content>
              <Box direction="vertical" gap="SP4">
                <Text>
                  WebMCP adds AI-accessible tools to your site, allowing AI agents to help visitors
                  with navigation, e-commerce, and more.
                </Text>

                {status === 'success' ? (
                  <Text weight="bold" skin="success">
                    WebMCP is now enabled on your site!
                  </Text>
                ) : status === 'error' ? (
                  <Box direction="vertical" gap="SP2">
                    <Text weight="bold" skin="error">
                      Failed to enable WebMCP
                    </Text>
                    <Text size="small" secondary>
                      {errorMessage}
                    </Text>
                  </Box>
                ) : (
                  <Button
                    onClick={handleEnable}
                    disabled={status === 'loading'}
                  >
                    {status === 'loading' ? 'Enabling...' : 'Enable WebMCP'}
                  </Button>
                )}
              </Box>
            </Card.Content>
          </Card>
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
}
