import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FACEBOOK_GRAPH_API_VERSION,
  FACEBOOK_PAGE_OAUTH_SCOPES,
  getFacebookAuthorizationEndpoint,
  getFacebookGraphBaseUrl,
  normalizeFacebookGraphApiVersion,
} from '../../shared/facebookOAuth.js';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Facebook Page Live OAuth configuration', () => {
  it('uses one current Graph API version for authorization and Graph requests', () => {
    expect(DEFAULT_FACEBOOK_GRAPH_API_VERSION).toBe('v26.0');
    expect(normalizeFacebookGraphApiVersion('v26.0')).toBe('v26.0');
    expect(normalizeFacebookGraphApiVersion('not-a-version')).toBe('v26.0');
    expect(getFacebookAuthorizationEndpoint()).toBe('https://www.facebook.com/v26.0/dialog/oauth');
    expect(getFacebookGraphBaseUrl()).toBe('https://graph.facebook.com/v26.0');
  });

  it('requests only the permissions used by the managed Page Live flow', () => {
    expect(FACEBOOK_PAGE_OAUTH_SCOPES).toEqual([
      'public_profile',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
    ]);
    expect(FACEBOOK_PAGE_OAUTH_SCOPES).not.toContain('email');
    expect(FACEBOOK_PAGE_OAUTH_SCOPES).not.toContain('pages_manage_metadata');
    expect(FACEBOOK_PAGE_OAUTH_SCOPES).not.toContain('publish_video');
  });

  it('keeps the production destination callback canonical and removes legacy v18 runtime paths', () => {
    const oauthService = read('services/oauthService.ts');
    const providerConfig = read('services/oauthProviderConfig.ts');
    const server = read('server/app.js');
    const chatAggregator = read('services/chatAggregator.ts');

    expect(providerConfig).toContain(
      "export const CANONICAL_FRONTEND_CALLBACK = 'https://www.chatscream.live/oauth/callback'",
    );
    expect(oauthService).toContain('scopes: [...FACEBOOK_PAGE_OAUTH_SCOPES]');
    expect(fs.existsSync(path.join(root, 'components/OAuthSetup.tsx'))).toBe(false);
    for (const source of [oauthService, server, chatAggregator]) {
      expect(source).not.toContain('v18.0');
    }
  });

  it('requires a selected managed Page before creating a Facebook live destination', () => {
    const server = read('server/app.js');
    const destinations = read('components/DestinationManager.tsx');

    expect(server).toContain("message: 'Select a managed Facebook Page to go live.'");
    expect(destinations).not.toContain("handleAddFacebookPage(null, 'Personal Profile')");
  });
});
