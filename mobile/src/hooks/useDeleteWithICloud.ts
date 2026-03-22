import { useState, useCallback } from "react";
import { Alert } from "react-native";
import { isSyncEnabled } from "../../services/icloudSyncService";
import {
  tombstoneEntry,
  deleteEntryWithICloud,
  deleteEntry,
  tombstoneFolder,
  deleteFolderWithICloud,
  deleteFolder,
} from "../../services/journalStorage";
import { safeErrorMessage } from "../../utils/errorHelpers";
import { t } from "../i18n";

type DeleteType = "entry" | "folder";

interface DeleteTarget {
  id: string;
  filename?: string;
  name?: string;
}

export function useDeleteWithICloud(
  setSnackbar: (msg: string) => void,
  onDeleted?: (id: string) => void
) {
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const requestDelete = useCallback(
    (target: DeleteTarget) => {
      setDeleteTarget(target);
      setDeleteDialogVisible(true);
    },
    []
  );

  const confirmDeleteEntry = useCallback(async () => {
    if (!deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    try {
      const syncOn = await isSyncEnabled();
      if (syncOn) {
        setDeleteDialogVisible(false);
        Alert.alert(
          t("deleteDialog.icloudTitle"),
          t("deleteDialog.message"),
          [
            {
              text: t("deleteDialog.localOnly"),
              onPress: async () => {
                try {
                  await tombstoneEntry(deleteTarget.id);
                  onDeleted?.(deleteTarget.id);
                } catch (e) {
                  setSnackbar(safeErrorMessage(e, t("errors.deleteFailed")));
                }
                setDeleteLoading(false);
                setDeleteTarget(null);
              },
            },
            {
              text: t("deleteDialog.everywhere"),
              style: "destructive",
              onPress: async () => {
                try {
                  await deleteEntryWithICloud(deleteTarget.id);
                  onDeleted?.(deleteTarget.id);
                } catch (e) {
                  setSnackbar(safeErrorMessage(e, t("errors.deleteFailed")));
                }
                setDeleteLoading(false);
                setDeleteTarget(null);
              },
            },
          ]
        );
        return;
      }
      await deleteEntry(deleteTarget.id);
      onDeleted?.(deleteTarget.id);
    } catch (e) {
      setSnackbar(safeErrorMessage(e, t("errors.deleteFailed")));
    } finally {
      setDeleteLoading(false);
    }
    setDeleteDialogVisible(false);
    setDeleteTarget(null);
  }, [deleteTarget, deleteLoading, setSnackbar, onDeleted]);

  const confirmDeleteFolder = useCallback(async () => {
    if (!deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    try {
      const syncOn = await isSyncEnabled();
      if (syncOn) {
        setDeleteDialogVisible(false);
        Alert.alert(
          t("deleteDialog.icloudTitle"),
          t("deleteDialog.folderIcloudMessage", { name: deleteTarget.name }),
          [
            {
              text: t("deleteDialog.localOnly"),
              onPress: async () => {
                try {
                  await tombstoneFolder(deleteTarget.id);
                  onDeleted?.(deleteTarget.id);
                } catch (e) {
                  setSnackbar(safeErrorMessage(e, t("errors.deleteFailed")));
                }
                setDeleteLoading(false);
                setDeleteTarget(null);
              },
            },
            {
              text: t("deleteDialog.everywhere"),
              style: "destructive",
              onPress: async () => {
                try {
                  await deleteFolderWithICloud(deleteTarget.id);
                  onDeleted?.(deleteTarget.id);
                } catch (e) {
                  setSnackbar(safeErrorMessage(e, t("errors.deleteFailed")));
                }
                setDeleteLoading(false);
                setDeleteTarget(null);
              },
            },
          ]
        );
        return;
      }
      await deleteFolder(deleteTarget.id);
      onDeleted?.(deleteTarget.id);
    } catch (e) {
      setSnackbar(safeErrorMessage(e, t("errors.deleteFailed")));
    } finally {
      setDeleteLoading(false);
    }
    setDeleteDialogVisible(false);
    setDeleteTarget(null);
  }, [deleteTarget, deleteLoading, setSnackbar, onDeleted]);

  const cancelDelete = useCallback(() => {
    setDeleteDialogVisible(false);
    setDeleteTarget(null);
  }, []);

  return {
    deleteDialogVisible,
    deleteTarget,
    deleteLoading,
    requestDelete,
    confirmDeleteEntry,
    confirmDeleteFolder,
    cancelDelete,
  };
}
