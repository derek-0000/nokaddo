import { useState } from 'react'
import DeckConfigurationEditor from './deck-configuration-editor'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle, Settings, Trash2, X } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '#/components/ui/drawer'
import { notionKeys, notionMutations } from '#/integrations/notion/api'
import type { CardGroups, NotionDataset } from '#/integrations/notion/api'
import { toPublicError } from '#/lib/errors'

type DeckSettingsDrawerProps = {
  cardGroup: CardGroups[number]
  dataset: NotionDataset
  deckId: string
  deckTitle: string
}

export default function DeckSettingsDrawer({
  deckId,
  deckTitle,
  cardGroup,
  dataset,
}: DeckSettingsDrawerProps) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const deleteDeck = useMutation({
    ...notionMutations.deleteCardGroup(),
    onSuccess: async () => {
      queryClient.setQueriesData<CardGroups>(
        { queryKey: notionKeys.cardGroupsAll },
        (cardGroups) => cardGroups?.filter((group) => group.id !== deckId),
      )

      queryClient.removeQueries({
        queryKey: notionKeys.cardGroupConfig(deckId),
      })
      queryClient.removeQueries({
        queryKey: notionKeys.cardGroupStudyData(deckId),
      })

      queryClient.invalidateQueries({
        queryKey: notionKeys.cardGroupsAll,
      })

      await navigate({ to: '/app' })
    },
  })

  return (
    <Drawer swipeDirection="down" open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Deck settings"
          />
        }
      >
        <Settings />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="relative pr-12">
          <DrawerTitle>Deck settings</DrawerTitle>
          <DrawerDescription>
            Manage settings for {deckTitle}.
          </DrawerDescription>
          <DrawerClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3"
                aria-label="Close deck settings"
              />
            }
          >
            <X />
          </DrawerClose>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
            {open && (
              <DeckConfigurationEditor
                cardGroup={cardGroup}
                dataset={dataset}
                onSaved={() => setOpen(false)}
              />
            )}
            <p className="mt-3 mb-3">Danger</p>
            <div className="mt-auto rounded-xl border border-destructive/25 bg-destructive/5 p-3">
              <h2 className="text-sm font-semibold">Delete deck</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Remove this deck and its study progress. The source dataset and
                its cards will stay in Notion.
              </p>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      className="mt-3 w-full"
                    />
                  }
                >
                  <Trash2 />
                  Delete deck
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {deckTitle}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the deck configuration and the four Nokaddo
                      progress columns from your source dataset. Your cards and
                      other columns will stay in Notion, but your study progress
                      cannot be recovered.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {deleteDeck.isError ? (
                    <p className="mt-3 text-xs text-destructive" role="alert">
                      {toPublicError(deleteDeck.error).message}
                    </p>
                  ) : null}
                  <AlertDialogFooter>
                    <AlertDialogClose
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          disabled={deleteDeck.isPending}
                        />
                      }
                    >
                      Cancel
                    </AlertDialogClose>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deleteDeck.isPending}
                      onClick={() =>
                        deleteDeck.mutate({ data: { dataGroupId: deckId } })
                      }
                    >
                      {deleteDeck.isPending ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                      {deleteDeck.isPending ? 'Deleting…' : 'Delete deck'}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
