import { createServices } from './service';

// Reuse caches and cooldowns within a warm function instance. No shared D1
// binding is required for this small Vercel demonstration deployment.
const { handle } = createServices();

export function fetch(request: Request): Promise<Response> {
  // Deliberately share the conservative client quota; do not trust IP headers.
  return handle(request, 'vercel-demo');
}
