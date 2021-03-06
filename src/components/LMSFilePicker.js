import { Component, h } from 'preact';
import propTypes from 'prop-types';

import AuthWindow from '../utils/AuthWindow';
import Button from './Button';
import Dialog from './Dialog';
import DirectoryBreadcrumbs from './DirectoryBreadcrumbs';
import FileList from './FileList';
import { AuthorizationError, listFiles } from '../utils/api';

const Fragment = children => <span>{children}</span>;

/**
 * A file picker dialog that allows the user to choose files from their
 * LMS's file storage.
 *
 * The picker will attempt to list files when mounted, and will show an
 * authorization popup if necessary.
 */
export default class LMSFilePicker extends Component {
  constructor(props) {
    super(props);

    this.state = {
      /**
       * `true` if we are waiting for the user to authorize the app's access
       * to files in the LMS.
       */
      isAuthorizing: false,

      /**
       * The array of files returned by a call to `listFiles`.
       */
      files: [],

      /**
       * The current directory within the LMS's file system.
       */
      path: '',

      /** Set to `true` if the list of files is being fetched. */
      isLoading: true,
    };
    this._authenticateAndFetchFiles = this._authenticateAndFetchFiles.bind(
      this
    );
    this._fetchFiles = this._fetchFiles.bind(this);
  }

  componentDidMount() {
    this._authenticateAndFetchFiles();
  }

  componentDidUpdate(prevProps, prevState) {
    // Re-fetch files if user navigated to a different directory.
    if (this.state.path !== prevState.path) {
      this._fetchFiles();
    }
  }

  async _fetchFiles() {
    this.setState({ isLoading: true });
    const { authToken } = this.props;
    const files = await listFiles(authToken, this.state.path);
    this.setState({ isLoading: false, files });
  }

  async _authenticateAndFetchFiles() {
    if (this._authWindow) {
      this._authWindow.focus();
      return;
    }

    // Create the authentication window. We might not show this to the user if
    // they are already authenticated, but we must call `window.open` in the
    // current turn of the event loop because certain browsers (eg. Firefox)
    // do not persist the "user gesture occurred" state across microtasks.
    const { authToken, lmsName } = this.props;
    this._authWindow = new AuthWindow({ authToken, lmsName });

    try {
      // Perform an API call to check if we are already authorized.
      await this._fetchFiles();
    } catch (e) {
      if (e instanceof AuthorizationError) {
        this.setState({ isAuthorizing: true });

        // Show authorization window and wait for it to close.
        await this._authWindow.authorize();

        // Try to fetch files again.
        try {
          await this._fetchFiles();
          this.setState({ isAuthorizing: false });
        } catch (e) {
          // Authorization failed, close the picker.
          this.props.onCancel();
        }
      }
    } finally {
      this._authWindow.close();
      this._authWindow = null;
    }
  }

  render() {
    const { lmsName, onCancel, onSelectFile } = this.props;
    const { files, isAuthorizing, isLoading, path } = this.state;

    const changePath = path => this.setState({ path });

    const selectFile = file => {
      if (file.type === 'directory') {
        this.setState({ path: path + '/' + file.name });
      } else {
        onSelectFile(path + '/' + file.name);
      }
    };

    const cancel = () => {
      if (this._authWindow) {
        this._authWindow.close();
      }
      onCancel();
    };

    const title = isAuthorizing ? 'Authorizing' : `Select file from ${lmsName}`;

    return (
      <Dialog
        contentClass="LMSFilePicker__dialog"
        title={title}
        onCancel={cancel}
      >
        {isAuthorizing && (
          <Fragment>
            Waiting for authorization to access your files in {lmsName}{' '}
            <Button
              onClick={this._authenticateAndFetchFiles}
              label="Show authorization window"
            />
          </Fragment>
        )}
        {files && (
          <Fragment>
            <DirectoryBreadcrumbs
              path={path}
              onChangePath={changePath}
              isLoading={isLoading}
            />
            <FileList files={files} onSelectFile={selectFile} />
          </Fragment>
        )}
      </Dialog>
    );
  }
}

LMSFilePicker.propTypes = {
  /**
   * Auth token for use in calls to the backend.
   */
  authToken: propTypes.string,

  /**
   * The name of the LMS to display in API controls, eg. "Canvas".
   */
  lmsName: propTypes.string,

  /** Callback invoked if the user cancels file selection. */
  onCancel: propTypes.func,

  /**
   * Callback invoked with the path of the selected file if the user makes
   * a selection.
   */
  onSelectFile: propTypes.func,
};
