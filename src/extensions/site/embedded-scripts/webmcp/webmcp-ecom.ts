/**
 * WebMCP E-commerce Script
 *
 * Registers WebMCP tools for Wix Stores e-commerce functionality.
 * Tools are exposed via the navigator.modelContext API for AI agents.
 *
 * WebMCP requires Chrome 146+ with chrome://flags/#model-context-api enabled.
 */

import { site } from '@wix/site';
import { createClient } from '@wix/sdk';
import { products } from '@wix/stores';
import { currentCart } from '@wix/ecom';

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

// Initialize WebMCP tools
async function initWebMCP() {
  // Check for WebMCP support
  if (!('modelContext' in navigator) || !navigator.modelContext) {
    console.log('[WebMCP] WebMCP API not supported in this browser. Requires Chrome 146+ with experimental flags enabled.');
    return;
  }

  console.log('[WebMCP] Initializing Wix e-commerce tools...');

  // Create Wix client with site authentication
  // Using type assertion to work around TypeScript limitations with dynamic SDK types
  const wixClient = createClient({
    auth: site.auth(),
    host: site.host({ applicationId: APP_ID }),
    modules: {
      products,
      currentCart,
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
    auth: {
      getAccessTokenInjector: () => unknown;
    };
  };

  // Export the access token injector for the embedded script runtime
  (window as unknown as { injectAccessTokenFunction?: unknown }).injectAccessTokenFunction =
    wixClient.auth.getAccessTokenInjector();

  const modelContext = navigator.modelContext;

  // Tool: Search Products
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
    description: 'List all products in the store with pagination. Use this to browse the product catalog.',
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
    description: 'Add a product to the current shopping cart. Requires product ID and quantity. Optionally specify product options for variants.',
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
    description: 'Get the current shopping cart contents. Shows all items, quantities, and basic pricing information.',
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
    description: 'Get estimated cart totals including subtotal, tax, shipping estimates, and discounts. Use this before checkout to show the customer the total cost.',
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

  console.log('[WebMCP] Wix e-commerce tools registered successfully.');
  console.log('[WebMCP] Available tools: wix_search_products, wix_get_product, wix_list_products, wix_add_to_cart, wix_get_cart, wix_get_cart_totals');
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
