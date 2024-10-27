import { Extension } from '@tiptap/core';
import codemark from 'prosemirror-codemark';
import Code from '@tiptap/extension-code'
import { type MarkType } from 'prosemirror-model';

export interface InlineCodePluginOptions {
  markType?: null | undefined | MarkType
}

/**
 * Uses https://github.com/curvenote/editor/tree/main/packages/prosemirror-codemark to make inline code much nicer to use.
 */
export const InlineCodePlugin = Extension.create({
  name: 'rhino-inline-code',
  addExtensions () {
    return [
      Code
    ]
  },
  addProseMirrorPlugins() {
    return codemark({ markType: this.editor.schema.marks.code });
  },
});
