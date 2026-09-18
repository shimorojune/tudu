"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { EditorContent, EditorContext, useEditor } from "@tiptap/react"
import { FileHandler } from "@tiptap/extension-file-handler"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { FindAndReplace } from "@tiptap/extension-find-and-replace"
import { Placeholder, Selection } from "@tiptap/extensions"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

// --- Tiptap Node ---
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import { NodeBackground } from "@/components/tiptap-extension/node-background-extension"
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/components/tiptap-ui/color-highlight-popover"
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from "@/components/tiptap-ui/link-popover"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button"
import {
  SearchAndReplace,
  SearchAndReplaceButton,
} from "@/components/tiptap-ui/search-and-replace"

// --- Icons ---
import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"

// --- Hooks ---
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"
import { useWindowSize } from "@/hooks/use-window-size"
import { useCursorVisibility } from "@/hooks/use-cursor-visibility"

// --- Styles ---
import "@/components/tiptap-templates/simple/simple-editor.scss"
import { cn } from "@/lib/utils"
import { AttachFileToolbarButton } from "@/components/editor/AttachFileToolbarButton"
import {
  AuthenticatedImage,
  AuthenticatedVideo,
} from "@/components/editor/editorAttachmentExtensions"
import {
  handleDescriptionFiles,
  type TaskDescriptionUploadFn,
} from "@/components/editor/taskDescriptionAttachments"
import {
  handleAttachmentAnchorClick,
  useDownloadAttachment,
} from "@/providers/AttachmentDownloadContext"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

export type SimpleEditorTaskAttachments = {
  upload?: TaskDescriptionUploadFn;
};

export type SimpleEditorProps = {
  contentHtml?: string;
  onChange?: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  taskAttachments?: SimpleEditorTaskAttachments;
};

const SEARCH_AND_REPLACE_SCROLL_OPTIONS: ScrollIntoViewOptions = {
  block: "center",
}

function AttachmentToolbarControls({
  upload,
}: {
  upload: TaskDescriptionUploadFn
}) {
  const { editor } = useTiptapEditor()
  return <AttachFileToolbarButton editor={editor} upload={upload} />
}

const MainToolbarContent = ({
  onHighlighterClick,
  onLinkClick,
  onSearchAndReplaceClick,
  isSearchAndReplaceOpen,
  searchAndReplaceButtonRef,
  isMobile,
  attachmentUpload,
}: {
  onHighlighterClick: () => void
  onLinkClick: () => void
  onSearchAndReplaceClick: () => void
  isSearchAndReplaceOpen: boolean
  searchAndReplaceButtonRef: React.RefObject<HTMLButtonElement | null>
  isMobile: boolean
  attachmentUpload?: TaskDescriptionUploadFn
}) => {
  return (
    <>
      <Spacer />

      {attachmentUpload ? (
        <ToolbarGroup>
          <AttachmentToolbarControls upload={attachmentUpload} />
        </ToolbarGroup>
      ) : null}

      {attachmentUpload ? <ToolbarSeparator /> : null}

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
        <ListDropdownMenu
          modal={false}
          types={["bulletList", "orderedList", "taskList"]}
        />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <Spacer />

      {isMobile && <ToolbarSeparator />}

      <ToolbarGroup>
        <SearchAndReplaceButton
          ref={searchAndReplaceButtonRef}
          aria-expanded={isSearchAndReplaceOpen}
          data-active-state={isSearchAndReplaceOpen ? "on" : "off"}
          onClick={onSearchAndReplaceClick}
        />
      </ToolbarGroup>
    </>
  )
}

const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: "highlighter" | "link"
  onBack: () => void
}) => (
  <>
    <ToolbarGroup>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === "highlighter" ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {type === "highlighter" ? (
      <ColorHighlightPopoverContent />
    ) : (
      <LinkContent />
    )}
  </>
)

export function SimpleEditor({
  contentHtml = "<p></p>",
  onChange,
  readOnly = false,
  placeholder = "Start typing...",
  ariaLabel = "Rich text editor",
  className,
  taskAttachments,
}: SimpleEditorProps) {
  const isMobile = useIsBreakpoint()
  const { height } = useWindowSize()
  const [mobileView, setMobileView] = useState<"main" | "highlighter" | "link">(
    "main"
  )
  const [isSearchAndReplaceOpen, setIsSearchAndReplaceOpen] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const searchAndReplaceButtonRef = useRef<HTMLButtonElement>(null)
  const previousContentRef = useRef<string | null>(null)
  const attachmentUpload = taskAttachments?.upload
  const downloadAttachment = useDownloadAttachment()

  const extensions = useMemo(() => {
    const base = [
      StarterKit.configure({
        horizontalRule: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
      HorizontalRule,
      NodeBackground,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Typography,
      Superscript,
      Subscript,
      Selection,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
      FindAndReplace.configure({
        searchDebounceMs: 500,
        injectCSS: false,
      }),
    ]

    if (!taskAttachments) {
      return base
    }

    const attachmentExtensions = [AuthenticatedImage, AuthenticatedVideo]

    if (!attachmentUpload) {
      return [...base, ...attachmentExtensions]
    }

    return [
      ...base,
      ...attachmentExtensions,
      FileHandler.configure({
        onDrop: (editor, files) => {
          void handleDescriptionFiles(editor, files, attachmentUpload)
        },
        onPaste: (editor, files) => {
          void handleDescriptionFiles(editor, files, attachmentUpload)
        },
        consumePasteEvent: true,
      }),
    ]
  }, [attachmentUpload, placeholder, taskAttachments])

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": ariaLabel,
        class: "simple-editor",
        role: "textbox",
      },
    },
    extensions,
    content: contentHtml,
    onUpdate: ({ editor: instance }) => {
      if (readOnly) {
        return
      }
      onChange?.(instance.getHTML())
    },
  })

  const onEditorClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a")
    if (!anchor) {
      return
    }
    handleAttachmentAnchorClick(event, anchor, downloadAttachment)
  }, [downloadAttachment])

  useEffect(() => {
    if (!editor) {
      return
    }
    editor.setEditable(!readOnly)
  }, [editor, readOnly])

  useEffect(() => {
    if (!editor) {
      return
    }
    if (editor.isFocused) {
      return
    }
    if (editor.getHTML() === contentHtml) {
      previousContentRef.current = contentHtml
      return
    }
    previousContentRef.current = contentHtml
    editor.commands.setContent(contentHtml, { emitUpdate: false })
  }, [contentHtml, editor])

  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
  })

  useEffect(() => {
    if (!isMobile && mobileView !== "main") {
      setMobileView("main")
    }
  }, [isMobile, mobileView])

  const openSearchAndReplace = useCallback(() => {
    setMobileView("main")
    setIsSearchAndReplaceOpen(true)
  }, [])

  const closeSearchAndReplace = useCallback(() => {
    setIsSearchAndReplaceOpen(false)
    searchAndReplaceButtonRef.current?.focus()
  }, [])

  const toggleSearchAndReplace = useCallback(() => {
    if (isSearchAndReplaceOpen) {
      closeSearchAndReplace()
      return
    }

    openSearchAndReplace()
  }, [closeSearchAndReplace, isSearchAndReplaceOpen, openSearchAndReplace])

  return (
    <div
      className={cn("simple-editor-wrapper", className)}
      data-ph-mask="true"
      data-testid="tiptap-simple-editor"
      onClick={onEditorClick}
    >
      <EditorContext.Provider value={{ editor }}>
        {!readOnly ? (
          <Toolbar
            ref={toolbarRef}
            data-testid="tiptap-toolbar"
            style={{
              ...(isMobile
                ? {
                    bottom: `calc(100% - ${height - rect.y}px)`,
                  }
                : {}),
            }}
          >
            {mobileView === "main" ? (
              <MainToolbarContent
                onHighlighterClick={() => setMobileView("highlighter")}
                onLinkClick={() => setMobileView("link")}
                onSearchAndReplaceClick={toggleSearchAndReplace}
                isSearchAndReplaceOpen={isSearchAndReplaceOpen}
                searchAndReplaceButtonRef={searchAndReplaceButtonRef}
                isMobile={isMobile}
                attachmentUpload={attachmentUpload}
              />
            ) : (
              <MobileToolbarContent
                type={mobileView === "highlighter" ? "highlighter" : "link"}
                onBack={() => setMobileView("main")}
              />
            )}
          </Toolbar>
        ) : null}

        {!readOnly ? (
          <SearchAndReplace
            className="simple-editor-search-and-replace"
            open={isSearchAndReplaceOpen}
            onOpen={openSearchAndReplace}
            onClose={closeSearchAndReplace}
            scrollIntoViewOptions={SEARCH_AND_REPLACE_SCROLL_OPTIONS}
          />
        ) : null}

        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content"
        />
      </EditorContext.Provider>
    </div>
  )
}
