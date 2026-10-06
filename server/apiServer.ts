import type { Plugin } from 'vite';
import { buildSeedDataset } from '../src/offline/seedData.ts';
import { IdempotentServerLedger } from '../src/sync/syncEngine.ts';
import type { Order } from '../src/types/domain.ts';

interface MiddlewareRequest {
  url?: string;
  method?: string;
  on(event: 'data', listener: (chunk: unknown) => void): void;
  on(event: 'end', listener: () => void): void;
}

interface MiddlewareResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

/**
 * Embedded RESTful Backend API plugin for Booth Checkout.
 * Exposes:
 * - GET  /api/health
 * - GET  /api/catalog
 * - GET  /api/orders
 * - POST /api/orders (idempotent single order upsert)
 * - POST /api/sync   (idempotent batch transaction synchronization)
 */
export function boothCheckoutApiPlugin(): Plugin {
  const seed = buildSeedDataset();
  const serverLedger = new IdempotentServerLedger(seed.orders);

  return {
    name: 'booth-checkout-api',
    configureServer(server) {
      server.middlewares.use((rawReq, rawRes, next) => {
        const req = rawReq as unknown as MiddlewareRequest;
        const res = rawRes as unknown as MiddlewareResponse;

        if (!req.url || !req.url.startsWith('/api/')) {
          return next();
        }

        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET' && req.url === '/api/health') {
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              status: 'ok',
              service: 'Booth Checkout API',
              timestamp: new Date().toISOString(),
              syncedOrderCount: serverLedger.getOrderCount(),
            })
          );
          return;
        }

        if (req.method === 'GET' && req.url === '/api/catalog') {
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              event: seed.event,
              vendors: seed.vendors,
              priceOptions: seed.priceOptions,
              inventory: seed.inventory,
              downloadedAt: new Date().toISOString(),
            })
          );
          return;
        }

        if (req.method === 'GET' && req.url === '/api/orders') {
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              orders: serverLedger.getAllOrders(),
            })
          );
          return;
        }

        if (
          req.method === 'POST' &&
          (req.url === '/api/sync' || req.url === '/api/orders')
        ) {
          let body = '';
          req.on('data', (chunk: unknown) => {
            body += String(chunk);
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              if (req.url === '/api/orders') {
                const order = parsed.order as Order;
                const result = serverLedger.upsertOrder(order);
                res.statusCode = 200;
                res.end(JSON.stringify(result));
                return;
              }

              const orders = Array.isArray(parsed.orders)
                ? (parsed.orders as Order[])
                : [];
              const batchResult = serverLedger.syncBatch(orders);
              res.statusCode = 200;
              res.end(JSON.stringify(batchResult));
            } catch (err) {
              res.statusCode = 400;
              res.end(
                JSON.stringify({
                  error:
                    err instanceof Error ? err.message : 'Invalid request payload',
                })
              );
            }
          });
          return;
        }

        next();
      });
    },
  };
}
