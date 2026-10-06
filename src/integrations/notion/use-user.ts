import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { notionKeys, notionMutations, notionQueries } from './api'
import { workspaceRegistryKeys } from '#/integrations/kv/api'

export function useUser() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: viewer } = useQuery(notionQueries.viewer())
  const disconnect = useMutation(notionMutations.disconnect())

  const signOut = useCallback(() => {
    disconnect.mutate(undefined, {
      onSuccess: () => {
        queryClient.removeQueries({ queryKey: notionKeys.all })
        queryClient.removeQueries({ queryKey: workspaceRegistryKeys.all })
        queryClient.setQueryData(notionKeys.viewer, null)
        void navigate({
          to: '/',
          search: {
            oauthResult: undefined,
          },
        })
      },
    })
  }, [disconnect, navigate, queryClient])

  return {
    user: viewer?.user ?? null,
    signOut,
    isSigningOut: disconnect.isPending,
    signOutError: disconnect.isError ? disconnect.error : null,
  }
}
