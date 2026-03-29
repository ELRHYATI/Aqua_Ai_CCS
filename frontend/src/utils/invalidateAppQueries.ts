import type { QueryClient } from '@tanstack/react-query'

const DASHBOARD_QUERY_ROOTS = ['dashboard', 'estran', 'finance', 'achat', 'ml'] as const

/**
 * After Excel upload or OneDrive sync: mark stale and wait for active queries to refetch
 * so charts and KPIs update immediately (not stuck behind staleTime).
 */
export async function invalidateDashboardDataQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const root = query.queryKey[0]
      return typeof root === 'string' && (DASHBOARD_QUERY_ROOTS as readonly string[]).includes(root)
    },
  })
}
