import {
  _clearCctvFrame,
  _queueCctvFrame,
  _settleCctvFrame,
  _syncCctvSourceBadge,
} from './cctvFrames.js';
import {
  _activeCctvCameraId,
  _resetCctvCalibration,
  _beginCctvCalValueEdit,
  _syncCctvCalReadout,
} from './cctvCalibration.js';
import {
  _calBadgeLabel,
  _renderCctvState,
  _typeCctvSummary,
  _updateCctvSyncChip,
} from './cctvPresentation.js';
import {
  _initCctvPanel,
  _initCctvMaximizeControls,
  _initCctvWallControls,
  _syncAutoMaximizeButton,
} from './cctvBindings.js';
import { createCctvMaximizeViewer } from './cctvMaximize.js';
import { createCctvWall } from './cctvWall.js';

/** Own camera-panel interaction and presentation; receive the camera port and application actions. */
export class CctvControls {
  constructor({ elements, cctv, actions }) {
    Object.assign(this, elements);
    this.cctv = cctv;
    this.actions = actions;
    this.destroyed = false;
    this.listeners = new AbortController();
    this._cctvUnsubscribe = null;
    this._cctvState = null;
    this._cctvSummaryTypingTimer = null;
    this._lastCctvSummaryText = '';
    this._lastSeenCctvActiveId = null;
    this._cctvChipHideTimer = null;
    this._cctvChipWasBusy = false;
    this._cctvFrameRequestToken = 0;
    this._cctvFramePreloader = null;
    this._calibrationEdit = null;
    this._actionGeneration = 0;
    // Penampil layar penuh dan preferensinya. Mati secara bawaan supaya alur
    // klik yang sudah ada tidak berubah bagi operator yang tidak memintanya.
    this._maximizeViewer = createCctvMaximizeViewer({});
    this._autoMaximize = false;
    // Mengklik sebuah kotak dinding menaikkannya ke layar penuh, yang menumpuk
    // DI ATAS dinding — menutupnya mengembalikan operator ke dinding.
    this._wall = createCctvWall({
      onCellActivate: (cameraId, meta) =>
        this._maximizeViewer?.open(cameraId, meta),
    });
    this._initCctvPanel();
  }
  listen(target, type, handler, options = {}) {
    target?.addEventListener(type, handler, {
      ...options,
      signal: this.listeners.signal,
    });
  }
  getState() {
    return this._cctvState;
  }
  connect() {
    this._cctvUnsubscribe?.();
    this._cctvUnsubscribe = null;
    if (this.destroyed) return;
    this._cctvUnsubscribe = this.cctv.subscribe?.((state) =>
      this._renderCctvState(state),
    );
    if (this.cctv.getUIState) this._renderCctvState(this.cctv.getUIState());
  }
  _clearCctvFrame(...args) {
    return _clearCctvFrame.call(this, ...args);
  }
  _queueCctvFrame(...args) {
    return _queueCctvFrame.call(this, ...args);
  }
  _settleCctvFrame(...args) {
    return _settleCctvFrame.call(this, ...args);
  }
  _syncCctvSourceBadge(...args) {
    return _syncCctvSourceBadge.call(this, ...args);
  }
  _activeCctvCameraId(...args) {
    return _activeCctvCameraId.call(this, ...args);
  }
  _resetCctvCalibration(...args) {
    return _resetCctvCalibration.call(this, ...args);
  }
  _beginCctvCalValueEdit(...args) {
    return _beginCctvCalValueEdit.call(this, ...args);
  }
  _syncCctvCalReadout(...args) {
    return _syncCctvCalReadout.call(this, ...args);
  }
  _calBadgeLabel(...args) {
    return _calBadgeLabel.call(this, ...args);
  }
  _renderCctvState(...args) {
    return _renderCctvState.call(this, ...args);
  }
  _typeCctvSummary(...args) {
    return _typeCctvSummary.call(this, ...args);
  }
  _updateCctvSyncChip(...args) {
    return _updateCctvSyncChip.call(this, ...args);
  }
  _initCctvPanel(...args) {
    return _initCctvPanel.call(this, ...args);
  }
  _initCctvMaximizeControls(...args) {
    return _initCctvMaximizeControls.call(this, ...args);
  }
  _initCctvWallControls(...args) {
    return _initCctvWallControls.call(this, ...args);
  }
  _syncAutoMaximizeButton(...args) {
    return _syncAutoMaximizeButton.call(this, ...args);
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this._actionGeneration++;
    this.listeners.abort();
    this._cctvUnsubscribe?.();
    this._cctvUnsubscribe = null;
    this._calibrationEdit?.(false);
    this._maximizeViewer?.destroy();
    this._maximizeViewer = null;
    this._wall?.destroy();
    this._wall = null;
    this._clearCctvFrame();
    clearInterval(this._cctvSummaryTypingTimer);
    clearTimeout(this._cctvChipHideTimer);
    this._cctvSummaryTypingTimer = null;
    this._cctvChipHideTimer = null;
    this._cctvSyncChip?.classList.remove('visible');
  }
}
