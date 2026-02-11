/**
 * WebMCP Site Tools Script
 *
 * Registers WebMCP tools for Wix site functionality including:
 * - General site navigation and structure
 * - E-commerce (Wix Stores) - uses Catalog V3 API
 * - Blog posts
 * - Member information
 *
 * Tools are exposed via the navigator.modelContext API for AI agents.
 * WebMCP requires Chrome 146+ with chrome://flags/#model-context-api enabled.
 *
 * Tools load dynamically based on:
 * - Which Wix apps are installed on the site
 * - The current page context (product page, cart, blog, etc.)
 */

console.log('[WebMCP] Script file loaded! Version: 2024-02-11-v7');

import { site } from '@wix/site';
import { site as siteSite } from '@wix/site-site';
import { createClient } from '@wix/sdk';
import { products } from '@wix/stores';
import { currentCart } from '@wix/ecom';
import { posts } from '@wix/blog';
import { members } from '@wix/members';

// App ID from wix.config.json
const APP_ID = '116cabf2-b8ab-4168-8d5b-6e74a6283923';

// Wix App IDs for detecting installed apps
const WIX_STORES_APP_ID = '1380b703-ce81-ff05-f115-39571d94dfcd';
const WIX_BLOG_APP_ID = '14bcded7-0066-7c35-14d7-466cb3f09103';
const WIX_MEMBERS_APP_ID = '14cc59bc-f0b7-15b8-e1c7-89ce41d0e0c9';

// Lazy-initialized Wix client (created on first use to avoid race conditions)
let wixClient: ReturnType<typeof createClient> | null = null;

// Track when access token has been injected
let authReady = false;
let authReadyResolvers: Array<() => void> = [];
let pendingAccessToken: string | null = null;

// Auth timeout in ms - if token isn't injected within this time, throw an error
const AUTH_TIMEOUT_MS = 15000;

// Get or create the Wix client
function getWixClient() {
  if (!wixClient) {
    console.log('[WebMCP] Creating Wix client...');
    wixClient = createClient({
      auth: site.auth(),
      host: site.host({ applicationId: APP_ID }),
      modules: {
        products,
        currentCart,
        posts,
        members,
        siteSite,
      },
    });
    console.log('[WebMCP] Wix client created');

    // If we received the access token before client was created, inject it now
    if (pendingAccessToken) {
      console.log('[WebMCP] Injecting pending access token...');
      const injector = (wixClient as any).auth.getAccessTokenInjector();
      injector(pendingAccessToken);
      authReady = true;
      console.log('[WebMCP] Pending access token injected!');
      authReadyResolvers.forEach(resolve => resolve());
      authReadyResolvers = [];
    }
  }
  return wixClient;
}

// Promise that resolves when auth is ready (with timeout)
function waitForAuth(): Promise<void> {
  if (authReady) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      // Remove this resolver from the list
      const idx = authReadyResolvers.indexOf(resolve);
      if (idx >= 0) authReadyResolvers.splice(idx, 1);
      reject(new Error('Auth token not injected within timeout. Make sure the embedded script is configured correctly with injectAccessTokenFunction exported.'));
    }, AUTH_TIMEOUT_MS);

    authReadyResolvers.push(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

// Export access token injector - Wix calls this to inject the token
// This MUST be exported at module level for Wix to find it
export const injectAccessTokenFunction = (token: string) => {
  console.log('[WebMCP] Access token being injected, token received:', !!token);

  if (!wixClient) {
    // Client not created yet, store token for later
    console.log('[WebMCP] Client not ready, storing token for later...');
    pendingAccessToken = token;
    return;
  }

  // Client exists, inject the token
  const injector = (wixClient as any).auth.getAccessTokenInjector();
  const result = injector(token);
  authReady = true;
  console.log('[WebMCP] Access token injected successfully!');
  // Resolve all waiting promises
  authReadyResolvers.forEach(resolve => resolve());
  authReadyResolvers = [];
  return result;
};

console.log('[WebMCP] Module loaded, injectAccessTokenFunction exported');
console.log('[WebMCP] injectAccessTokenFunction:', typeof injectAccessTokenFunction);

// Wait a moment then create client and test (gives Wix time to set up context)
setTimeout(() => {
  console.log('[WebMCP] Deferred initialization starting...');
  const client = getWixClient();
  console.log('[WebMCP] Auth object:', (client as any).auth);

  // Test the SDK AFTER auth is ready
  waitForAuth().then(() => {
    console.log('[WebMCP] Auth ready, testing products query...');
    client.products
      .queryProducts()
      .limit(1)
      .find()
      .then((result: any) => {
        console.log('[WebMCP] TEST SUCCESS - Products found:', result.items.length);
      })
      .catch((error: any) => {
        console.error('[WebMCP] TEST FAILED - Error:', error);
      });
  });
}, 100);

// Type declarations for WebMCP API
interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

interface ModelContext {
  registerTool(tool: ModelContextTool): void;
  getTools?(): ModelContextTool[];
}

declare global {
  interface Navigator {
    modelContext?: ModelContext;
  }
}

// Product type for our formatted output (Catalog V3 structure)
interface FormattedProduct {
  id: string | undefined;
  name: string | undefined;
  description: string | undefined;
  price: string | undefined;
  compareAtPrice: string | undefined;
  currency: string | undefined;
  sku: string | undefined;
  visible: boolean | undefined;
  productType: string | undefined;
  slug: string | undefined;
  url: string | undefined;
  media: (string | undefined)[] | undefined;
  inventory: {
    status: string | undefined;
    inStock: boolean | undefined;
  };
  options: Array<{
    name: string | undefined;
    choices: (string | undefined)[] | undefined;
  }> | undefined;
  brand: string | undefined;
  ribbon: string | undefined;
}

// Installed apps detection result
interface InstalledApps {
  hasStores: boolean;
  hasBlog: boolean;
  hasMembers: boolean;
}

// Page context for dynamic tool loading
interface PageContext {
  isProductPage: boolean;
  isCartPage: boolean;
  isBlogPage: boolean;
  isMemberArea: boolean;
}

// Cart type for our formatted output
interface FormattedCart {
  id?: string;
  items: Array<{
    id: string | undefined;
    quantity: number | undefined;
    productName: string | undefined;
    price: string | undefined;
    fullPrice: string | undefined;
    image: string | undefined;
  }>;
  totalQuantity: number;
  currency?: string;
}

// Helper function to format product data (Catalog V1 structure)
function formatProduct(product: Record<string, unknown>): FormattedProduct {
  const priceData = product.priceData as Record<string, unknown> | undefined;
  const media = product.media as Record<string, unknown> | undefined;
  const mediaItems = media?.items as Array<Record<string, unknown>> | undefined;
  const stock = product.stock as Record<string, unknown> | undefined;
  const productOptions = product.productOptions as Array<Record<string, unknown>> | undefined;

  return {
    id: product._id as string | undefined,
    name: product.name as string | undefined,
    description: product.description as string | undefined,
    price: (priceData?.formatted as Record<string, unknown> | undefined)?.price as string | undefined,
    compareAtPrice: (priceData?.formatted as Record<string, unknown> | undefined)?.discountedPrice as string | undefined,
    currency: priceData?.currency as string | undefined,
    sku: product.sku as string | undefined,
    visible: product.visible as boolean | undefined,
    productType: product.productType as string | undefined,
    slug: product.slug as string | undefined,
    url: (product.productPageUrl as Record<string, unknown> | undefined)?.base as string | undefined,
    media: mediaItems?.map(
      (item) => (item.image as Record<string, unknown> | undefined)?.url as string | undefined
    ),
    inventory: {
      status: stock?.inventoryStatus as string | undefined,
      inStock: stock?.inStock as boolean | undefined,
    },
    options: productOptions?.map((opt) => ({
      name: opt.name as string | undefined,
      choices: (opt.choices as Array<Record<string, unknown>> | undefined)?.map(
        (c) => c.value as string | undefined
      ),
    })),
    brand: product.brand as string | undefined,
    ribbon: product.ribbon as string | undefined,
  };
}

// Helper function to format cart data
function formatCart(cart: Record<string, unknown> | undefined): FormattedCart {
  if (!cart) {
    return { items: [], totalQuantity: 0 };
  }

  const lineItems = cart.lineItems as Array<Record<string, unknown>> | undefined;

  return {
    id: cart._id as string | undefined,
    items: lineItems?.map((item) => ({
      id: item._id as string | undefined,
      quantity: item.quantity as number | undefined,
      productName: ((item.productName as Record<string, unknown> | undefined)?.original as string | undefined),
      price: (item.price as Record<string, unknown> | undefined)?.formattedAmount as string | undefined,
      fullPrice: (item.fullPrice as Record<string, unknown> | undefined)?.formattedAmount as string | undefined,
      image: (item.image as Record<string, unknown> | undefined)?.url as string | undefined,
    })) || [],
    totalQuantity: lineItems?.reduce((sum, item) => sum + ((item.quantity as number) || 0), 0) || 0,
    currency: cart.currency as string | undefined,
  };
}

// Helper function to format blog post data
function formatBlogPost(post: Record<string, unknown>) {
  return {
    id: post._id,
    title: post.title,
    excerpt: post.excerpt,
    content: post.plainContent || post.contentText,
    url: post.url,
    slug: post.slug,
    coverImage: (post.coverMedia as Record<string, unknown> | undefined)?.image,
    author: post.memberId,
    publishedDate: post.firstPublishedDate,
    lastUpdated: post.lastPublishedDate,
    categories: post.categoryIds,
    tags: post.tagIds,
    featured: post.featured,
    pinned: post.pinned,
    commentingEnabled: post.commentingEnabled,
    minutesToRead: post.minutesToRead,
  };
}

// Detect which Wix apps are installed by querying the site structure API
// This checks which app IDs have pages registered on the site
async function detectInstalledAppsFromAPI(): Promise<InstalledApps> {
  try {
    // Wait for auth to be ready before making API calls
    await waitForAuth();

    const client = getWixClient();
    const structure = await client.siteSite.getSiteStructure();

    // Collect all application IDs from the site's pages
    const appIds = new Set<string>();
    structure.pages.forEach((page: any) => {
      if (page.applicationId) {
        appIds.add(page.applicationId);
      }
    });

    // Also check prefixes which can indicate installed apps
    const prefixes = structure.prefixes || [];
    const prefixPaths = prefixes.map((p: any) => p.prefix?.toLowerCase() || '');

    // Check for each app
    const hasStores = appIds.has(WIX_STORES_APP_ID) ||
      prefixPaths.some((p: string) => p.includes('product') || p.includes('shop') || p.includes('store') || p.includes('cart'));

    const hasBlog = appIds.has(WIX_BLOG_APP_ID) ||
      prefixPaths.some((p: string) => p.includes('blog') || p.includes('post'));

    const hasMembers = appIds.has(WIX_MEMBERS_APP_ID) ||
      prefixPaths.some((p: string) => p.includes('account') || p.includes('member') || p.includes('profile'));

    console.log('[WebMCP] Detected apps from API - Stores:', hasStores, 'Blog:', hasBlog, 'Members:', hasMembers);
    console.log('[WebMCP] App IDs found:', Array.from(appIds));
    console.log('[WebMCP] Prefixes found:', prefixPaths);

    return { hasStores, hasBlog, hasMembers };
  } catch (error) {
    console.error('[WebMCP] Failed to detect apps from API:', error);
    // Fallback to returning no apps detected - tools won't be registered
    return { hasStores: false, hasBlog: false, hasMembers: false };
  }
}

// Detect the current page context based on URL and DOM
function detectPageContext(): PageContext {
  const pathname = window.location.pathname.toLowerCase();
  const url = window.location.href.toLowerCase();

  // Detect product page (common patterns: /product/, /product-page/, contains product ID in URL)
  const isProductPage = pathname.includes('/product/') ||
    pathname.includes('/product-page/') ||
    document.querySelector('[data-hook="product-page"]') !== null ||
    document.querySelector('.product-page') !== null;

  // Detect cart page
  const isCartPage = pathname.includes('/cart') ||
    pathname.includes('/checkout') ||
    document.querySelector('[data-hook="cart-page"]') !== null;

  // Detect blog page
  const isBlogPage = pathname.includes('/blog') ||
    pathname.includes('/post/') ||
    document.querySelector('[data-hook="blog-post"]') !== null ||
    document.querySelector('.blog-post-page') !== null;

  // Detect member area
  const isMemberArea = pathname.includes('/account') ||
    pathname.includes('/my-account') ||
    pathname.includes('/members') ||
    pathname.includes('/profile');

  return {
    isProductPage,
    isCartPage,
    isBlogPage,
    isMemberArea,
  };
}

// Initialize WebMCP tools
async function initWebMCP() {
  // Check for WebMCP support
  if (!('modelContext' in navigator) || !navigator.modelContext) {
    console.log('[WebMCP] WebMCP API not supported in this browser. Requires Chrome 146+ with experimental flags enabled.');
    return;
  }

  console.log('[WebMCP] Initializing Wix site tools...');

  // Detect installed apps using the site structure API (reliable)
  // and page context for contextual tool loading
  const installedApps = await detectInstalledAppsFromAPI();
  const pageContext = detectPageContext();

  console.log('[WebMCP] Page context:', pageContext);
  console.log('[WebMCP] Installed apps:', installedApps);

  const modelContext = navigator.modelContext;
  const registeredTools: string[] = [];

  console.log('[WebMCP] modelContext object:', modelContext);
  console.log('[WebMCP] registerTool function:', typeof modelContext.registerTool);

  // ==========================================
  // GENERAL SITE TOOLS (always available)
  // ==========================================

  // Tool: Get Site Structure (Pages)
  try {
    console.log('[WebMCP] Registering wix_get_site_structure...');
    modelContext.registerTool({
    name: 'wix_get_site_structure',
    description: 'Get the site structure including all pages, their URLs, and navigation info. Use this to understand what pages exist on the site.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      try {
        // Wait for auth token to be injected
        await waitForAuth();

        const structure = await getWixClient().siteSite.getSiteStructure();

        return {
          success: true,
          pages: structure.pages.map(page => ({
            name: page.name,
            type: page.type,
            url: page.url,
            isHomePage: page.isHomePage || false,
            applicationId: page.applicationId,
          })),
          prefixes: structure.prefixes,
          lightboxes: structure.lightboxes,
          totalPages: structure.pages.length,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    });
    registeredTools.push('wix_get_site_structure');
    console.log('[WebMCP] Registered wix_get_site_structure successfully');
  } catch (err) {
    console.error('[WebMCP] Failed to register wix_get_site_structure:', err);
  }

  // Tool: Get Current Page Info
  try {
    console.log('[WebMCP] Registering wix_get_current_page...');
    modelContext.registerTool({
    name: 'wix_get_current_page',
    description: 'Get information about the current page the user is viewing, including URL, title, and main content text.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      try {
        // Get page info from DOM since we're running client-side
        const title = document.title;
        const url = window.location.href;
        const pathname = window.location.pathname;

        // Try to extract main content text
        const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        const textContent = mainContent?.innerText?.slice(0, 5000) || ''; // Limit to 5000 chars

        // Get meta description if available
        const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content');

        // Get headings for structure
        const headings = Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 20).map(h => ({
          level: h.tagName.toLowerCase(),
          text: h.textContent?.trim(),
        }));

        return {
          success: true,
          page: {
            title,
            url,
            pathname,
            metaDescription,
            headings,
            contentPreview: textContent.slice(0, 2000),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    });
    registeredTools.push('wix_get_current_page');
    console.log('[WebMCP] Registered wix_get_current_page successfully');
  } catch (err) {
    console.error('[WebMCP] Failed to register wix_get_current_page:', err);
  }

  // ==========================================
  // BLOG TOOLS (only if Wix Blog is installed)
  // ==========================================

  if (installedApps.hasBlog) {
    // Tool: Get Blog Posts
    modelContext.registerTool({
      name: 'wix_get_blog_posts',
      description: 'Get a list of published blog posts. Use this to browse blog content.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Maximum number of posts to return (default: 10, max: 100)',
            default: 10,
          },
          offset: {
            type: 'integer',
            description: 'Number of posts to skip for pagination (default: 0)',
            default: 0,
          },
        },
      },
      execute: async (params) => {
        try {
          // Wait for auth token to be injected
          await waitForAuth();

          const limit = Math.min((params.limit as number) || 10, 100);
          const offset = (params.offset as number) || 0;

          const result = await getWixClient().posts.listPosts({
            paging: { limit, offset },
            fieldsets: ['URL', 'CONTENT_TEXT'],
          });

          return {
            success: true,
            posts: result.posts.map(formatBlogPost),
            totalCount: result.posts.length,
            offset,
            hasMore: result.posts.length === limit,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });
    registeredTools.push('wix_get_blog_posts');

    // Tool: Get Single Blog Post (only on blog pages or when blog is installed)
    if (pageContext.isBlogPage || !pageContext.isProductPage) {
      modelContext.registerTool({
        name: 'wix_get_blog_post',
        description: 'Get detailed information about a specific blog post by its ID. Returns full post content.',
        inputSchema: {
          type: 'object',
          properties: {
            postId: {
              type: 'string',
              description: 'The unique ID of the blog post to retrieve',
            },
          },
          required: ['postId'],
        },
        execute: async (params) => {
          try {
            // Wait for auth token to be injected
            await waitForAuth();

            const postId = params.postId as string;

            const result = await getWixClient().posts.getPost(postId, {
              fieldsets: ['URL', 'CONTENT_TEXT', 'RICH_CONTENT'],
            });

            if (!result.post) {
              return {
                success: false,
                error: 'Blog post not found',
              };
            }

            return {
              success: true,
              post: formatBlogPost(result.post),
            };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        },
      });
      registeredTools.push('wix_get_blog_post');
    }
  }

  // ==========================================
  // MEMBER TOOLS (only if Members is installed)
  // ==========================================

  if (installedApps.hasMembers) {
    // Tool: Get Current Member Info
    modelContext.registerTool({
      name: 'wix_get_member_info',
      description: 'Get information about the currently logged-in member. Returns null if no member is logged in.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          // Wait for auth token to be injected
          await waitForAuth();

          const result = await getWixClient().members.getMyMember({
            fieldsets: ['FULL'],
          });

          if (!result.member) {
            return {
              success: true,
              loggedIn: false,
              member: null,
            };
          }

          const member = result.member;
          return {
            success: true,
            loggedIn: true,
            member: {
              id: member._id,
              loginEmail: member.loginEmail,
              status: member.status,
              contactId: member.contactId,
              profile: member.profile,
              privacyStatus: member.privacyStatus,
              activityStatus: member.activityStatus,
              createdDate: member._createdDate,
            },
          };
        } catch (error) {
          // Not logged in or members not enabled
          if (error instanceof Error && (error.message.includes('401') || error.message.includes('403'))) {
            return {
              success: true,
              loggedIn: false,
              member: null,
            };
          }
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });
    registeredTools.push('wix_get_member_info');
  }

  // ==========================================
  // E-COMMERCE TOOLS (only if Wix Stores is installed)
  // Using Catalog V3 API for better compatibility
  // ==========================================

  if (installedApps.hasStores) {
    // Tool: Search Products (V3 API)
    modelContext.registerTool({
      name: 'wix_search_products',
      description: 'Search for products in the Wix store by keyword. Returns matching products with their details including name, price, description, and images.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to find products by name or description',
          },
          limit: {
            type: 'integer',
            description: 'Maximum number of results to return (default: 10, max: 100)',
            default: 10,
          },
        },
        required: ['query'],
      },
      execute: async (params) => {
        console.log('[WebMCP] wix_search_products called with params:', params);
        try {
          // Wait for auth token to be injected
          await waitForAuth();

          const query = params.query as string;
          const limit = Math.min((params.limit as number) || 10, 100);

          console.log('[WebMCP] Calling products.queryProducts...');
          // V1 API: Use queryProducts with startsWith filter
          const result = await getWixClient().products
            .queryProducts()
            .startsWith('name', query)
            .limit(limit)
            .find();

          console.log('[WebMCP] queryProducts result:', result);
          return {
            success: true,
            products: result.items.map(formatProduct),
            totalCount: result.items.length,
          };
        } catch (error) {
          console.error('[WebMCP] queryProducts error:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });
    registeredTools.push('wix_search_products');

    // Tool: Get Product by ID (V3 API)
    modelContext.registerTool({
      name: 'wix_get_product',
      description: 'Get detailed information about a specific product by its ID. Returns full product details including variants, options, and inventory.',
      inputSchema: {
        type: 'object',
        properties: {
          productId: {
            type: 'string',
            description: 'The unique ID of the product to retrieve',
          },
        },
        required: ['productId'],
      },
      execute: async (params) => {
        console.log('[WebMCP] wix_get_product called with params:', params);
        try {
          // Wait for auth token to be injected
          await waitForAuth();

          const productId = params.productId as string;

          console.log('[WebMCP] Calling products.getProduct...');
          // V1 API: Use getProduct
          const result = await getWixClient().products.getProduct(productId);

          console.log('[WebMCP] getProduct result:', result);
          if (!result.product) {
            return {
              success: false,
              error: 'Product not found',
            };
          }

          return {
            success: true,
            product: formatProduct(result.product),
          };
        } catch (error) {
          console.error('[WebMCP] getProduct error:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });
    registeredTools.push('wix_get_product');

    // Tool: List Products (V3 API)
    modelContext.registerTool({
      name: 'wix_list_products',
      description: 'List all products in the store with pagination. Use this to browse the product catalog.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Maximum number of products to return (default: 10, max: 100)',
            default: 10,
          },
          offset: {
            type: 'integer',
            description: 'Number of products to skip for pagination (default: 0)',
            default: 0,
          },
        },
      },
      execute: async (params) => {
        console.log('[WebMCP] wix_list_products called with params:', params);
        try {
          // Wait for auth token to be injected
          console.log('[WebMCP] Waiting for auth...');
          await waitForAuth();
          console.log('[WebMCP] Auth ready!');

          const limit = Math.min((params.limit as number) || 10, 100);
          const offset = (params.offset as number) || 0;

          console.log('[WebMCP] Calling products.queryProducts...');
          console.log('[WebMCP] getWixClient().products:', getWixClient().products);

          // V1 API: Use queryProducts with skip/limit
          const query = getWixClient().products.queryProducts();
          console.log('[WebMCP] Query object created:', query);

          const queryWithPaging = query.skip(offset).limit(limit);
          console.log('[WebMCP] Query with paging:', queryWithPaging);

          console.log('[WebMCP] Calling find()...');
          const result = await queryWithPaging.find();

          console.log('[WebMCP] queryProducts result:', result);
          return {
            success: true,
            products: result.items.map(formatProduct),
            totalCount: result.items.length,
            offset: offset,
            hasMore: result.items.length === limit,
          };
        } catch (error) {
          console.error('[WebMCP] queryProducts error:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });
    registeredTools.push('wix_list_products');

    // Tool: Add to Cart
    modelContext.registerTool({
      name: 'wix_add_to_cart',
      description: 'Add a product to the current shopping cart. Requires product ID and quantity. Optionally specify product options for variants.',
      inputSchema: {
        type: 'object',
        properties: {
          productId: {
            type: 'string',
            description: 'The unique ID of the product to add to cart',
          },
          quantity: {
            type: 'integer',
            description: 'Number of items to add (default: 1)',
            default: 1,
          },
          options: {
            type: 'string',
            description: 'JSON string of product options for variants (e.g., {"Size": "Large", "Color": "Blue"})',
          },
        },
        required: ['productId'],
      },
      execute: async (params) => {
        try {
          // Wait for auth token to be injected
          await waitForAuth();

          const productId = params.productId as string;
          const quantity = (params.quantity as number) || 1;
          const optionsStr = params.options as string | undefined;

          let variantOptions: Record<string, string> | undefined;
          if (optionsStr) {
            try {
              variantOptions = JSON.parse(optionsStr);
            } catch {
              return {
                success: false,
                error: 'Invalid options format. Must be valid JSON.',
              };
            }
          }

          const lineItems = [{
            catalogReference: {
              appId: WIX_STORES_APP_ID,
              catalogItemId: productId,
              options: variantOptions ? { options: variantOptions } : undefined,
            },
            quantity,
          }];

          const result = await getWixClient().currentCart.addToCurrentCart({ lineItems });

          return {
            success: true,
            cart: formatCart(result.cart),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });
    registeredTools.push('wix_add_to_cart');

    // Tool: Get Cart
    modelContext.registerTool({
      name: 'wix_get_cart',
      description: 'Get the current shopping cart contents. Shows all items, quantities, and basic pricing information.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          // Wait for auth token to be injected
          await waitForAuth();

          const result = await getWixClient().currentCart.getCurrentCart();

          return {
            success: true,
            cart: formatCart(result),
          };
        } catch (error) {
          // Cart not found typically means empty cart
          if (error instanceof Error && error.message.includes('404')) {
            return {
              success: true,
              cart: {
                items: [],
                totalQuantity: 0,
              },
            };
          }
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });
    registeredTools.push('wix_get_cart');

    // Tool: Get Cart Totals
    modelContext.registerTool({
      name: 'wix_get_cart_totals',
      description: 'Get estimated cart totals including subtotal, tax, shipping estimates, and discounts. Use this before checkout to show the customer the total cost.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          // Wait for auth token to be injected
          await waitForAuth();

          const result = await getWixClient().currentCart.estimateCurrentCartTotals({});

          const priceSummary = result.priceSummary as Record<string, unknown> | undefined;

          return {
            success: true,
            totals: {
              subtotal: (priceSummary?.subtotal as Record<string, unknown> | undefined)?.formattedAmount,
              total: (priceSummary?.total as Record<string, unknown> | undefined)?.formattedAmount,
              tax: (priceSummary?.tax as Record<string, unknown> | undefined)?.formattedAmount,
              discount: (priceSummary?.discount as Record<string, unknown> | undefined)?.formattedAmount,
              currency: result.currency,
            },
          };
        } catch (error) {
          // Cart not found typically means empty cart
          if (error instanceof Error && error.message.includes('404')) {
            return {
              success: true,
              totals: {
                subtotal: '$0.00',
                total: '$0.00',
                tax: '$0.00',
                discount: '$0.00',
              },
            };
          }
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });
    registeredTools.push('wix_get_cart_totals');
  } // End of Wix Stores conditional

  // Log registered tools - now uses dynamic list
  console.log('[WebMCP] Wix site tools registered successfully.');
  console.log(`[WebMCP] Installed apps: Stores=${installedApps.hasStores}, Blog=${installedApps.hasBlog}, Members=${installedApps.hasMembers}`);
  console.log(`[WebMCP] Page context: Product=${pageContext.isProductPage}, Cart=${pageContext.isCartPage}, Blog=${pageContext.isBlogPage}, Member=${pageContext.isMemberArea}`);
  console.log(`[WebMCP] Available tools (${registeredTools.length}): ${registeredTools.join(', ')}`);
}

// Initialize when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWebMCP);
} else {
  initWebMCP();
}
