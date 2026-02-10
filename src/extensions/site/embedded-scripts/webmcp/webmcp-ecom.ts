/**
 * WebMCP Site Tools Script
 *
 * Registers WebMCP tools for Wix site functionality including:
 * - General site navigation and structure
 * - E-commerce (Wix Stores)
 * - Blog posts
 * - Member information
 *
 * Tools are exposed via the navigator.modelContext API for AI agents.
 * WebMCP requires Chrome 146+ with chrome://flags/#model-context-api enabled.
 */

import { site } from '@wix/site';
import { site as siteSite } from '@wix/site-site';
import { createClient } from '@wix/sdk';
import { products } from '@wix/stores';
import { currentCart } from '@wix/ecom';
import { posts } from '@wix/blog';
import { members } from '@wix/members';

// App ID from wix.config.json
const APP_ID = '116cabf2-b8ab-4168-8d5b-6e74a6283923';

// Wix Stores App ID for catalog references
const WIX_STORES_APP_ID = '1380b703-ce81-ff05-f115-39571d94dfcd';

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

// Product type for our formatted output
interface FormattedProduct {
  id: string | undefined;
  name: string | undefined;
  description: string | undefined;
  price: string | undefined;
  currency: string | undefined;
  sku: string | undefined;
  visible: boolean | undefined;
  productType: string | undefined;
  slug: string | undefined;
  media: (string | undefined)[] | undefined;
  stock: {
    inStock: boolean | undefined;
    quantity: number | undefined;
  };
  options: Array<{
    name: string | undefined;
    choices: (string | undefined)[] | undefined;
  }> | undefined;
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

// Helper function to format product data
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
    currency: priceData?.currency as string | undefined,
    sku: product.sku as string | undefined,
    visible: product.visible as boolean | undefined,
    productType: product.productType as string | undefined,
    slug: product.slug as string | undefined,
    media: mediaItems?.map(
      (item) => (item.image as Record<string, unknown> | undefined)?.url as string | undefined
    ),
    stock: {
      inStock: stock?.inStock as boolean | undefined,
      quantity: stock?.quantity as number | undefined,
    },
    options: productOptions?.map((opt) => ({
      name: opt.name as string | undefined,
      choices: (opt.choices as Array<Record<string, unknown>> | undefined)?.map(
        (c) => c.value as string | undefined
      ),
    })),
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

// Initialize WebMCP tools
async function initWebMCP() {
  // Check for WebMCP support
  if (!('modelContext' in navigator) || !navigator.modelContext) {
    console.log('[WebMCP] WebMCP API not supported in this browser. Requires Chrome 146+ with experimental flags enabled.');
    return;
  }

  console.log('[WebMCP] Initializing Wix site tools...');

  // Create Wix client with site authentication
  const wixClient = createClient({
    auth: site.auth(),
    host: site.host({ applicationId: APP_ID }),
    modules: {
      products,
      currentCart,
      posts,
      members,
      siteSite,
    },
  }) as unknown as {
    products: {
      queryProducts: () => {
        startsWith: (field: string, value: string) => {
          limit: (n: number) => {
            find: () => Promise<{ items: Record<string, unknown>[] }>;
          };
        };
        skip: (n: number) => {
          limit: (n: number) => {
            find: () => Promise<{ items: Record<string, unknown>[] }>;
          };
        };
        limit: (n: number) => {
          find: () => Promise<{ items: Record<string, unknown>[] }>;
        };
      };
      getProduct: (id: string) => Promise<{ product: Record<string, unknown> | null }>;
    };
    currentCart: {
      addToCurrentCart: (options: { lineItems: Array<{ catalogReference: { appId: string; catalogItemId: string; options?: { options: Record<string, string> } }; quantity: number }> }) => Promise<{ cart: Record<string, unknown> }>;
      getCurrentCart: () => Promise<Record<string, unknown>>;
      estimateCurrentCartTotals: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
    posts: {
      listPosts: (options?: { paging?: { limit?: number; offset?: number }; fieldsets?: string[] }) => Promise<{ posts: Record<string, unknown>[] }>;
      getPost: (postId: string, options?: { fieldsets?: string[] }) => Promise<{ post: Record<string, unknown> }>;
      queryPosts: () => {
        limit: (n: number) => {
          find: () => Promise<{ items: Record<string, unknown>[] }>;
        };
      };
    };
    members: {
      getMyMember: (options?: { fieldsets?: string[] }) => Promise<{ member: Record<string, unknown> | null }>;
    };
    siteSite: {
      getSiteStructure: () => Promise<{
        pages: Array<{ name: string; type: string; url?: string; isHomePage?: boolean; applicationId?: string; prefix?: string }>;
        prefixes: Array<{ name: string; type: string; prefix: string; applicationId?: string }>;
        lightboxes: Array<{ name: string }>;
      }>;
    };
    auth: {
      getAccessTokenInjector: () => unknown;
    };
  };

  // Export the access token injector for the embedded script runtime
  (window as unknown as { injectAccessTokenFunction?: unknown }).injectAccessTokenFunction =
    wixClient.auth.getAccessTokenInjector();

  const modelContext = navigator.modelContext;

  // ==========================================
  // GENERAL SITE TOOLS
  // ==========================================

  // Tool: Get Site Structure (Pages)
  modelContext.registerTool({
    name: 'wix_get_site_structure',
    description: 'Get the site structure including all pages, their URLs, and navigation info. Use this to understand what pages exist on the site.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      try {
        const structure = await wixClient.siteSite.getSiteStructure();

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

  // Tool: Get Current Page Info
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

  // ==========================================
  // BLOG TOOLS
  // ==========================================

  // Tool: Get Blog Posts
  modelContext.registerTool({
    name: 'wix_get_blog_posts',
    description: 'Get a list of published blog posts. Use this to browse blog content on sites with Wix Blog installed.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of posts to return (default: 10, max: 100)',
        },
        offset: {
          type: 'number',
          description: 'Number of posts to skip for pagination (default: 0)',
        },
      },
    },
    execute: async (params) => {
      try {
        const limit = Math.min((params.limit as number) || 10, 100);
        const offset = (params.offset as number) || 0;

        const result = await wixClient.posts.listPosts({
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
        // Blog might not be installed
        if (error instanceof Error && (error.message.includes('404') || error.message.includes('not found'))) {
          return {
            success: false,
            error: 'Wix Blog is not installed on this site',
          };
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  });

  // Tool: Get Single Blog Post
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
        const postId = params.postId as string;

        const result = await wixClient.posts.getPost(postId, {
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

  // ==========================================
  // MEMBER TOOLS
  // ==========================================

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
        const result = await wixClient.members.getMyMember({
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

  // ==========================================
  // E-COMMERCE TOOLS
  // ==========================================

  // Tool: Search Products
  modelContext.registerTool({
    name: 'wix_search_products',
    description: 'Search for products in the Wix store by keyword. Returns matching products with their details including name, price, description, and images. Requires Wix Stores.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find products by name or description',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10, max: 100)',
        },
      },
      required: ['query'],
    },
    execute: async (params) => {
      try {
        const query = params.query as string;
        const limit = Math.min((params.limit as number) || 10, 100);

        const result = await wixClient.products
          .queryProducts()
          .startsWith('name', query)
          .limit(limit)
          .find();

        return {
          success: true,
          products: result.items.map(formatProduct),
          totalCount: result.items.length,
        };
      } catch (error) {
        if (error instanceof Error && (error.message.includes('404') || error.message.includes('not found'))) {
          return {
            success: false,
            error: 'Wix Stores is not installed on this site',
          };
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  });

  // Tool: Get Product by ID
  modelContext.registerTool({
    name: 'wix_get_product',
    description: 'Get detailed information about a specific product by its ID. Returns full product details including variants, options, and inventory. Requires Wix Stores.',
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
      try {
        const productId = params.productId as string;

        const result = await wixClient.products.getProduct(productId);

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
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  });

  // Tool: List Products
  modelContext.registerTool({
    name: 'wix_list_products',
    description: 'List all products in the store with pagination. Use this to browse the product catalog. Requires Wix Stores.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of products to return (default: 10, max: 100)',
        },
        offset: {
          type: 'number',
          description: 'Number of products to skip for pagination (default: 0)',
        },
      },
    },
    execute: async (params) => {
      try {
        const limit = Math.min((params.limit as number) || 10, 100);
        const offset = (params.offset as number) || 0;

        const result = await wixClient.products
          .queryProducts()
          .skip(offset)
          .limit(limit)
          .find();

        return {
          success: true,
          products: result.items.map(formatProduct),
          totalCount: result.items.length,
          offset: offset,
          hasMore: result.items.length === limit,
        };
      } catch (error) {
        if (error instanceof Error && (error.message.includes('404') || error.message.includes('not found'))) {
          return {
            success: false,
            error: 'Wix Stores is not installed on this site',
          };
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  });

  // Tool: Add to Cart
  modelContext.registerTool({
    name: 'wix_add_to_cart',
    description: 'Add a product to the current shopping cart. Requires product ID and quantity. Optionally specify product options for variants. Requires Wix Stores.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The unique ID of the product to add to cart',
        },
        quantity: {
          type: 'number',
          description: 'Number of items to add (default: 1)',
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

        const result = await wixClient.currentCart.addToCurrentCart({ lineItems });

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

  // Tool: Get Cart
  modelContext.registerTool({
    name: 'wix_get_cart',
    description: 'Get the current shopping cart contents. Shows all items, quantities, and basic pricing information. Requires Wix Stores.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      try {
        const result = await wixClient.currentCart.getCurrentCart();

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

  // Tool: Get Cart Totals
  modelContext.registerTool({
    name: 'wix_get_cart_totals',
    description: 'Get estimated cart totals including subtotal, tax, shipping estimates, and discounts. Use this before checkout to show the customer the total cost. Requires Wix Stores.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      try {
        const result = await wixClient.currentCart.estimateCurrentCartTotals({});

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

  // Log registered tools
  const tools = [
    'wix_get_site_structure',
    'wix_get_current_page',
    'wix_get_blog_posts',
    'wix_get_blog_post',
    'wix_get_member_info',
    'wix_search_products',
    'wix_get_product',
    'wix_list_products',
    'wix_add_to_cart',
    'wix_get_cart',
    'wix_get_cart_totals',
  ];

  console.log('[WebMCP] Wix site tools registered successfully.');
  console.log(`[WebMCP] Available tools (${tools.length}): ${tools.join(', ')}`);
}

// Initialize when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWebMCP);
} else {
  initWebMCP();
}

// Export for ESM module access token injection
export const injectAccessTokenFunction =
  (window as unknown as { injectAccessTokenFunction?: unknown }).injectAccessTokenFunction;
