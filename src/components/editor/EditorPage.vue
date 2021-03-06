<script>

import { docInfo } from '../../store/state'
import { SET_DOC } from '../../store/mutations'
import { mapGetters } from 'vuex'

import ProsemirrorEditor from '../../prosemirror'

import EditorToolbar from './EditorToolbar.vue'
import EditorActionButton from './EditorActionButton.vue'
import EditorSaveStatus from './EditorSaveStatus.vue'

import EditorLinkDialog from './dialogs/EditorLinkDialog.vue'
import EditorImageDialog from './dialogs/EditorImageDialog.vue'

import drive from '../../drive'
import DriveSave from '../../drive/save'
import driveChanges, { docSyncHandler } from '../../drive/changes'

import ErrorPanel from '../core/ErrorPanel.vue'
import ProgressSpinner from '../core/ProgressSpinner.vue'
import PopupMenu from '../core/PopupMenu'
import MenuTile from '../core/MenuTile'

import dialog from '../core/dialog'

import { addinActions, addinBehaviors } from '../../addins'

import printJS from 'print-js'

export default {
  name: 'EditorPage',

  components: {
    ProgressSpinner, ErrorPanel, 
    EditorToolbar, EditorActionButton, EditorSaveStatus,
    PopupMenu, MenuTile,
    EditorLinkDialog, EditorImageDialog
  },

  props: {
    doc_id: {
      type: String,
      default: null
    }
  },

  data: function() {
    return {
    
      // editor
      editor: null,

      // save and sync managers
      driveSave: null,
      syncHandler: null,

      // save status
      save_status: "clean",

      // load error
      error: null,

      // addin actions
      addin_actions: addinActions(),

      // addin behaviors
      addin_behaviors: addinBehaviors()

    }
  },

  computed: {

    ...mapGetters([
      'doc'
    ]),
    
    button_actions() {
      return this.filterActions('button');
    },

    menu_actions() {
      return this.filterActions('menu');
    },

    is_editable() {
      for (let i=0; i<this.addin_behaviors.length; i++) {
        let behavior = this.addin_behaviors[i];
        if (behavior.editable && !behavior.editable(this.doc.properties))
          return false;
      }
      return true;
    }
  },

  mounted() {

    drive.getFile(this.doc_id)
      .then(file => {

        // set doc info
        this.$store.commit(
          SET_DOC, 
          docInfo(this.doc_id, file.metadata.name, file.metadata.headRevisionId, file.metadata.properties)
        );
       
        // monitor and save editor changes (triggered by onUpdate hook installed below)
        this.driveSave = new DriveSave(
          this.doc_id,
          this.onSaveStatus,
          this.onSaved,
          this.onSaveError
        );

        // synchronize to changes made in other browsers
        this.syncHandler = docSyncHandler(
          this.doc_id,
          () => this.doc,
          this.onSyncMetadata,
          this.onSyncDoc,
          this.onSyncError
        );

        // initialize editor
        this.editor = new ProsemirrorEditor(this.$refs.prosemirror, {
          autoFocus: true,
          content: file.content,
          hooks: {
            isEditable: () => this.is_editable,
            onUpdate: this.onEditorUpdate,
            onSelectionChanged: this.onEditorSelectionChanged,
            onEditLink: this.onEditLink,
            onEditImage: this.onEditImage
          }
        });

        // subscribe to file changes
        return driveChanges.subscribe(this.syncHandler);
      })
      .then(() => {
        return drive.setFileViewed(this.doc_id);
      })
      .then(() => {
        drive.updateRecentDocs();
      })
      .catch(error => {
        this.error = error;
      });
  },

  beforeDestroy() {

    this.$store.commit(SET_DOC, docInfo());

    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
      driveChanges.unsubscribe(this.syncHandler);
    }
  },

  methods: {

    onEditorSelectionChanged(selection) {
      if (selection.type === 'node') {
        this.$refs.prosemirror.classList.add("has-node-selection");
      } else {
        this.$refs.prosemirror.classList.remove("has-node-selection");
      }
    },

    onEditorUpdate(update) {
      this.driveSave.onEditorUpdate(update);
    },

    onEditLink(link) {
      return this.$refs.linkDialog.show(link);
    },

    onEditImage(image) {
      return this.$refs.imageDialog.show(image);
    },

    onSaveStatus(status) {
      this.save_status = status;
    },

    onSaved(result) {
      this.doc.headRevisionId = result.headRevisionId;
    },

    onSaveError(error) {
      dialog.errorSnackbar(
        "Unable to save changes (" + error.message + "). " +
        "Please ensure you are online so that you don't lose work."
      );
    },

    onDriveChanged(changes) {
      this.syncManager.onDriveChanged(changes);
    },

    onSyncMetadata(metadata) {
      this.$store.commit(
        SET_DOC,
        docInfo(this.doc_id, metadata.name, metadata.headRevisionId, metadata.properties)
      );
    },

    onSyncDoc(doc) {
      this.$store.commmit(
        SET_DOC,
        docInfo(this.doc_id, doc.metadata.name, doc.metadata.headRevisionId, doc.metadata.properties)
      );
      
      this.editor.setContent(doc.content);
    },

    onSyncError(error) {
      dialog.errorSnackbar(
        "Error attempting to synchronize changes from Drive: " +
        error.message
      );
    },

    onPrintDocument() {
      printJS({
        printable: 'prosemirror',
        type: 'html',
        header: this.doc.title,
        headerStyle: 'font-size: 24pt; font-weight: bold; font-family: Georgia,Helvetica,"Times New Roman",Times,serif;',
        css: '/styles/print.css'
      });
    },

    onEditorAction(handler) {
      handler({
        id: this.doc_id,
        properties: this.doc.properties,
        setProperties: (properties) => {
          return drive
            .setFileProperties(this.doc_id, properties)
            .then(() => {
              this.doc.properties = {
                ...this.doc.properties,
                ...properties
              }
            })
            .catch(error => {
              dialog.errorSnackbar("Error setting file properties: " + 
                                    error.message);
            })
        }
      });
    },

    filterActions(type) { 
      // get all of the actions of this type
      let actions = this.addin_actions.filter(action => action.type === type);
      
      // apply the property filter
      let properties = this.doc.properties || {};
      return actions.filter(action => !action.filter || action.filter(properties));
    }
  }
}

</script>

<template>

  <div class="edit-container">
    <div v-show="editor">
      <v-card class="edit-card card--flex-toolbar">
        <v-toolbar card dense :height="40" prominent>

       
          <EditorToolbar :editor="editor" />
                 
          <v-spacer />
  
          <EditorSaveStatus :status="save_status" />

          <span>
            <EditorActionButton 
              v-for="action in button_actions" 
              :key="action.caption"
              :icon="action.icon" 
              :caption="action.caption" 
              @clicked="onEditorAction(action.handler)" 
            />
          </span>
          
          <PopupMenu>
            <MenuTile
              v-for="action in menu_actions"
              :key="action.caption" 
              :icon="action.icon" 
              :text="action.caption" 
              @clicked="onEditorAction(action.handler)" 
            />
            <v-divider />
            <MenuTile icon="print" text="Print Document..." @clicked="onPrintDocument" />
          </PopupMenu>
          
        </v-toolbar>

        <v-divider />

        <div id="prosemirror" ref="prosemirror" />
        <div id="prosemirror-sidebar" />
        
      </v-card>
    </div>

    <div v-if="error">
      <ErrorPanel :error="error" />
    </div>
    
    <div v-else-if="!editor">
      <ProgressSpinner />
    </div>

    <EditorLinkDialog ref="linkDialog" />
    <EditorImageDialog ref="imageDialog" />

  </div>
  
</template>

<style>

.edit-container {
  width: 100%;
  height: 100%;
}

.edit-container > div {
  height: 100%;
}

.edit-container .edit-card {
  height: 100%;
  position: relative;
}

.edit-container .edit-card .v-toolbar__content,
.edit-container .edit-card .v-toolbar__extension {
  padding: 0 8px;
}

.edit-container .edit-card .v-btn--icon {
  margin: 6px 0;
}

.edit-container .v-toolbar__content  .v-btn--small {
  padding: 0 10px;
  min-width: inherit;
}

.edit-container .v-toolbar__content .v-btn__content {
  text-transform: none;
}

.edit-container .editor-save-status {
  margin-right: 5px;
}

.edit-container #prosemirror {
  padding: 12px;
  position: absolute;
  top: 66px;
  left: 0;
  bottom: 0;
  right: 250px;
  overflow-y: scroll;
}

.edit-container #prosemirror-sidebar {
  padding: 12px;
  position: absolute;
  top: 39px;
  bottom: 0;
  right: 0;
  overflow-y: scroll;
  width: 250px;
  background-color:#f5f5f5;
  border-left: 1px solid rgba(0,0,0,0.12);
}


.edit-container .ProseMirror {
  outline: none;
}

.edit-container .ProseMirror code {
  color: inherit;
  background-color: inherit;
  font-size: inherit;
  font-weight: inherit;
  border-radius: initial;
  box-shadow: none;
}

.edit-container .ProseMirror code:before,
.edit-container .ProseMirror code:after {
  content: ''
}

.edit-container .ProseMirror pre code {
  width: 100%;
  margin-bottom: 16px;
}

.edit-container .ProseMirror hr {
  margin-top: 8px;
  margin-bottom: 16px;
  border: 0;
  height: 0;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
}

.edit-container .ProseMirror blockquote {
  padding-left: 1em;
  border-left: 3px solid #eee;
  margin-left: 0;
  margin-right: 0;
}

.edit-container .ProseMirror li > p {
  margin-bottom: 5px;
}

.edit-container .ProseMirror li:last-of-type > p {
  margin-bottom: 16px;
}

.edit-container .ProseMirror img {
  height: auto;
}

.edit-container .has-node-selection .ProseMirror .ProseMirror-selectednode {
  outline: 2px solid #b3d4fc;
}


</style>