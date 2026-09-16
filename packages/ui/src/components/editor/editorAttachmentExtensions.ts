import Image from "@tiptap/extension-image";
import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { AuthenticatedImageView } from "@/components/editor/AuthenticatedImageView";
import { AuthenticatedVideoView } from "@/components/editor/AuthenticatedVideoView";

export const AuthenticatedImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AuthenticatedImageView);
  },
});

export const AuthenticatedVideo = Node.create({
  name: "video",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, { controls: "controls" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AuthenticatedVideoView);
  },
});
