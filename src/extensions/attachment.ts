import { AttachmentManager } from "src/models/attachment-manager";
import type { AttachmentEditor } from "src/elements/attachment-editor";
import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { mergeAttributes, Node } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { selectionToInsertionEnd } from "@tiptap/core/src/helpers/selectionToInsertionEnd";
import { DOMSerializer, Node as ProseMirrorNode } from "prosemirror-model"
import { Maybe } from "src/types";


export interface AttachmentOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    attachment: {
      /**
       * Add an attachment(s)
       */
      setAttachment: (
        options: AttachmentManager | AttachmentManager[]
      ) => ReturnType;
    };
  }
}

function findAttribute(element: HTMLElement, attribute: string) {
  const attr = element
    .closest("action-text-attachment")
    ?.getAttribute(attribute);
  if (attr) return attr;

  const attrs = element
    .closest("figure[data-trix-attachment]")
    ?.getAttribute("data-trix-attachment");
  if (!attrs) return null;

  return JSON.parse(attrs)[attribute];
}

export interface ImageOptions {
  HTMLAttributes: Record<string, any>;
}
const AttachmentImage = Node.create({
  name: "attachment-image",
  selectable: false,
  draggable: false,
  group: "block",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (element) => findAttribute(element, "url"),
      },
      height: {
        default: "",
        parseHTML: (element) => findAttribute(element, "height"),
      },
      width: {
        default: "",
        parseHTML: (element) => findAttribute(element, "width"),
      },
      attachmentId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[src]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ];
  },
});

function handleGallery (node: ProseMirrorNode, tr: Transaction, newState: EditorState, pos: number) {
	let modified = false

  if (node.type.name != "attachment-gallery") return modified;

  if (node.nodeSize === 2) {
    tr.replaceWith(pos, pos + node.nodeSize, newState.schema.node("paragraph", null, []));
    modified = true;
  }

  return modified
}

function handleCaptions (node: ProseMirrorNode, tr: Transaction, newState: EditorState, pos: number) {
	let modified = false
  if (node.type.name !== "attachment-figure") return modified;

	// @see https://discuss.prosemirror.net/t/saving-content-containing-dom-generated-by-nodeview/2594/5
	let scratch = document.createElement("div")
	scratch.appendChild(DOMSerializer.fromSchema(newState.schema).serializeNode(node))

	const figcaption = scratch.querySelector("figcaption")

	if (figcaption == null) return modified

	const caption = figcaption.innerHTML
	if (node.attrs.caption !== caption) {
		tr.setNodeMarkup(pos, undefined, {
    	...node.attrs,
    	caption,
  	})
  	modified = true
  }

	return modified
}

const AttachmentGallery = Node.create({
  name: "attachment-gallery",
  group: "block",
  draggable: false,
  selectable: false,
  content: "block*",

  parseHTML() {
    return [
      {
        tag: "div.attachment-gallery",
      },
    ];
  },

  renderHTML() {
    return ["div", mergeAttributes({}, { class: "attachment-gallery" }), 0];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _oldState, newState) => {
          const tr = newState.tr;
          let modified = false;

          // @TODO: Iterate through transactions instead of descendants (?).
          newState.doc.descendants((node, pos, _parent) => {
            const mutations = [
            	handleGallery(node, tr, newState, pos),
            	handleCaptions(node, tr, newState, pos)
            ]

						const shouldModify = mutations.some((bool) => bool === true)

          	if (shouldModify) {
          		modified = true
          	}
          });

          if (modified) return tr;

          return undefined
        }
      }),
    ];
  },
});

/** https://github.com/basecamp/trix/blob/main/src/trix/models/attachment.coffee#L4 */
const isPreviewable = /^image(\/(gif|png|jpe?g)|$)/

function canPreview (previewable: Boolean, contentType: Maybe<string>): Boolean {
	return (previewable || contentType?.match(isPreviewable) != null)
}

function toExtension (fileName: Maybe<string>): string {
	if (!fileName) return ""

  return "attachment--" + fileName
    .match(/\.(\w+)$/)?.[1]
    .toLowerCase()
}

function toType (content: Maybe<string>, previewable: Boolean): string {
	if (content) {
		return "attachment--content"
	}

	if (previewable) {
		return "attachment--preview"
	}

	return "attachment--file"
}


const Attachment = Node.create({
  name: "attachment-figure",
  group: "block attachmentFigure",
  content: "inline*",
  selectable: true,
  draggable: true,
  isolating: true,
  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: "attachment",
        "data-trix-attributes": JSON.stringify({ presentation: "gallery" }),
      },
    };
  },

  parseHTML() {
    return [
      // Generated by #to_trix_html
      {
        tag: "figure[data-trix-attachment]",
        // contentElement: "figcaption"
      },
      // Generated by the standard output.
      {
        tag: "figure.attachment",
        contentElement: "figcaption"
      },
    ];
  },

  renderHTML({ node }) {
    const {
      // Figure
      content,
      contentType,
      sgid,
      fileName,
      fileSize,
      caption,
      url,
      previewable,

      // Image
      src,
      width,
      height,
    } = node.attrs;

    const attachmentAttrs: Record<keyof typeof node.attrs, string> = {
    	caption,
      contentType,
      content,
      filename: fileName,
      filesize: fileSize,
      height,
      width,
      sgid,
      url,
      src
    };

    const figure = [
      "figure",
      mergeAttributes(this.options.HTMLAttributes, {
      	class: this.options.HTMLAttributes.class + " " + toType(content, canPreview(previewable, contentType)) + " " + toExtension(fileName),
        "data-trix-content-type": contentType,
        "data-trix-attachment": JSON.stringify(attachmentAttrs),
        "data-trix-attributes": JSON.stringify({
          caption,
          presentation: "gallery",
        }),
      }),
    ] as const;

		const figcaption = [
			"figcaption",
			mergeAttributes({}, {class: "attachment__caption attachment__caption--edited"}),
      0,
		] as const

		const image = [
      "img",
      mergeAttributes(
        {},
        {
          src: url || src,
          contenteditable: false,
          width,
          height,
        }
      ),
    ]

		if (!content) {
			return [
				...figure,
				image,
				figcaption
			]
		}

    return [
    	...figure,
    	figcaption
    ];
  },

  addAttributes() {
    return {
      attachmentId: { default: null },
      caption: {
        default: "",
        parseHTML: (element) => {
        	return element.querySelector("figcaption")?.innerHTML || findAttribute(element, "caption")
        }
      },
      progress: {
        default: 100,
      },
      sgid: {
        default: "",
        parseHTML: (element) => findAttribute(element, "sgid"),
      },
      src: {
        default: "",
        parseHTML: (element) => findAttribute(element, "src"),
      },
      height: {
        default: "",
        parseHTML: (element) => findAttribute(element, "height"),
      },
      width: {
        default: "",
        parseHTML: (element) => {
        	return findAttribute(element, "width")
        }
      },
      contentType: {
        default: "",
        parseHTML: (element) => {
        	// This is a special case where it exists as:
        	// figure["data-trix-attachment"]["contentType"] and
        	// action-text-attachment["content-type"]
          return findAttribute(element, "content-type") || JSON.parse(element.getAttribute("data-trix-attachment") || "").contentType || "application/octet-stream"
        }
      },
      fileName: {
        default: "",
        parseHTML: (element) => findAttribute(element, "filename"),
      },
      fileSize: {
        default: "",
        parseHTML: (element) => findAttribute(element, "filesize"),
      },
      content: {
        default: "",
        parseHTML: (element) => {
        	return findAttribute(element, "content") || element.closest("action-text-attachment")?.innerHTML || ""
        }
      },
      url: {
        default: "",
        parseHTML: (element) => {
        	return findAttribute(element, "url")
        }
      },
      previewable: {
      	default: false,
				parseHTML: (element) => {
					const { previewable } = JSON.parse(element.getAttribute("data-trix-attachment") || "{}")

					return previewable
				}
      }
    };
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const {
        content,
        contentType,
        sgid,
        fileName,
        progress,
        fileSize,
        url,
        src,
        width,
        height,
        caption,
        previewable
      } = node.attrs;

      const figure = document.createElement("figure");
      const figcaption = document.createElement("figcaption");

      if (!caption) {
      	figcaption.classList.add("is-empty")
      } else {
      	figcaption.classList.remove("is-empty")
      }

      figcaption.setAttribute("data-placeholder", "Add a caption...")

      figcaption.classList.add("attachment__caption");

      figure.setAttribute("class", this.options.HTMLAttributes.class + " " + toType(content, canPreview(previewable, contentType)) + " " + toExtension(fileName))
      figure.setAttribute("data-trix-content-type", node.attrs.contentType);

      // Convenient way to tell us its "final"
      if (sgid) figure.setAttribute("sgid", sgid);

      figure.setAttribute(
        "data-trix-attachment",
        JSON.stringify({
          contentType,
          content,
          filename: fileName,
          filesize: fileSize,
          height,
          width,
          sgid,
          url,
          caption,
        })
      );

      figure.setAttribute(
        "data-trix-attributes",
        JSON.stringify({
          presentation: "gallery",
          caption,
        })
      );

      const attachmentEditor = document.createElement(
        "ash-attachment-editor"
      ) as AttachmentEditor;
      attachmentEditor.setAttribute("file-name", fileName);
      attachmentEditor.setAttribute("file-size", fileSize);
      attachmentEditor.setAttribute("contenteditable", "false");

      attachmentEditor.setAttribute("progress", progress);

      figure.addEventListener("click", (e: Event) => {
        if (e.composedPath().includes(figcaption)) {
          return;
        }

        if (typeof getPos === "function") {
          editor
            .chain()
            .setTextSelection(getPos() + 1)
            .run();
        }
      });

      const img = document.createElement("img");
      img.setAttribute("contenteditable", "false");
      img.setAttribute("width", width);
      img.setAttribute("height", height);


      if (canPreview(previewable, contentType)) {
        if (url || src) {
          img.setAttribute("src", url || src);
        }
        if (!width || !height) {
          img.src = url || src;
          img.onload = () => {
            const { naturalHeight: height, naturalWidth: width } = img;

            if (typeof getPos === "function") {
              const view = editor.view;
              view.dispatch(
                view.state.tr.setNodeMarkup(getPos(), undefined, {
                  ...node.attrs,
                  height: height,
                  width: width,
                })
              );
            }
          };
        }
      }

      if (content && !canPreview(previewable, contentType)) {
        figure.prepend(attachmentEditor);
				figure.insertAdjacentHTML("beforeend", content)
      } else {
        figure.append(attachmentEditor, img, figcaption);
      }

      return {
        dom: figure,
        contentDOM: figcaption,
      }
    };
  },

  addCommands() {
    return {
      setAttachment:
        (options: AttachmentManager | AttachmentManager[]) =>
        ({ state, tr, dispatch }) => {
          const currentSelection = state.doc.resolve(state.selection.anchor);
          const before = state.selection.anchor - 2 < 0 ? 0 : state.selection.anchor - 2
          const nodeBefore = state.doc.resolve(before)

					// If we're in a paragraph directly following a gallery.
					const isInGalleryCurrent = currentSelection.node(1).type.name === "attachment-gallery"
					const isInGalleryAfter = nodeBefore.node(1)?.type.name === "attachment-gallery"

					const isInGallery = isInGalleryCurrent || isInGalleryAfter

					const { schema } = state
          const attachments: AttachmentManager[] = Array.isArray(options)
            ? options
            : ([] as AttachmentManager[]).concat(options);

          const attachmentNodes = attachments.map((attachment) => {
          		return schema.nodes["attachment-figure"].create(
          			attachment,
          			attachment.caption ? [schema.text(attachment.caption)] : []
            	);
          });

					if (isInGallery) {
						const end = currentSelection.end()
						const backtrack = isInGalleryCurrent ? 0 : 2
						tr.insert(end - backtrack, attachmentNodes);
					} else {
          	const gallery = schema.nodes["attachment-gallery"].create({}, attachmentNodes);
          	const currSelection = state.selection
						tr.replaceWith(currSelection.from - 1, currSelection.to, [
							schema.nodes.paragraph.create(),
							gallery,
							schema.nodes.paragraph.create(),
						]);
						selectionToInsertionEnd(tr, tr.steps.length - 1, -1)
					}


					if (dispatch) dispatch(tr)
					return true
        },
    };
  },
});

export const AttachmentFigcaption = Node.create({
  name: "attachment-figcaption",
  group: "block figcaption",
  content: "inline*",
  selectable: false,
  draggable: false,
  defining: true,
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: { class: "attachment__caption attachment--edited" },
    };
  },

  parseHTML() {
    return [
      {
        tag: `figcaption`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "figcaption",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },
});

/**
 * Plugin to fix firefox cursor disappearing inside contenteditable.
 * https://github.com/ProseMirror/prosemirror/issues/1113#issue-780389225
 */
export function FirefoxCaretFixPlugin() {
  let focusing = false;
  return new Plugin({
    props: {
      handleDOMEvents: {
        focus: (view) => {
          if (focusing) {
            focusing = false;
          } else {
            focusing = true;
            setTimeout(() => {
              view.dom.blur();
              view.dom.focus();
            });
          }
          return false;
        },
      },
    },
  });
}

export default Extension.create({
  addProseMirrorPlugins() {
    return [
    	FirefoxCaretFixPlugin()
    ];
  },
  addExtensions() {
    return [
      AttachmentGallery,
      Attachment,
      AttachmentImage,
      AttachmentFigcaption,
    ];
  },
});
