import { createContext, useContext, type ReactNode } from "react";
import {
  downloadAttachment as defaultDownloadAttachment,
  fetchAttachmentBlob,
  handleAttachmentAnchorClick,
  type AttachmentDownloadFn,
} from "@/lib/attachmentUrl";

export type { AttachmentDownloadFn };
export { fetchAttachmentBlob, handleAttachmentAnchorClick };

const AttachmentDownloadContext = createContext<AttachmentDownloadFn>(
  defaultDownloadAttachment,
);

export function useDownloadAttachment(): AttachmentDownloadFn {
  return useContext(AttachmentDownloadContext);
}

type AttachmentDownloadProviderProps = {
  download?: AttachmentDownloadFn;
  children: ReactNode;
};

export function AttachmentDownloadProvider({
  download,
  children,
}: AttachmentDownloadProviderProps) {
  return (
    <AttachmentDownloadContext.Provider
      value={download ?? defaultDownloadAttachment}
    >
      {children}
    </AttachmentDownloadContext.Provider>
  );
}
