/**
 * Deteksi orang YOLOv8 (Human-Detector) pada panel CCTV.
 *
 * ARSITEKTUR
 * ----------
 * Tombol DETECT meminta `/api/cctv/detect/:id`; proxy Vite mengambil bingkai
 * dari URL hulu yang terdaftar (atau menyerahkan URL stream HLS ke layanan
 * deteksi yang membukanya lewat FFmpeg), menjalankan YOLOv8n, lalu
 * mengembalikan kotak-kotak orang dalam koordinat piksel bingkai asli.
 * Kotak digambar pada <canvas> yang menutupi pratinjau bingkai.
 *
 * Kamera video (HLS) menampilkan SVG sintetis di pratinjau panel — proxy
 * tidak punya pendekode video — jadi untuk frameSource 'upstream-stream'
 * kotak TIDAK digambar di atas pratinjau; jumlahnya tetap ditampilkan karena
 * berasal dari stream yang sesungguhnya.
 */

/** Selang pengulangan deteksi pada mode AUTO (ms). */
const AUTO_INTERVAL_MS = 15_000;

/** Ganti teks chip status deteksi. */
export function _setCctvDetectChip(text, state) {
  if (!this._cctvDetectChip) return;
  this._cctvDetectChip.textContent = text;
  this._cctvDetectChip.dataset.detectState = state || '';
}

/** Sembunyikan overlay dan hapus semua kotak deteksi. */
export function _clearCctvDetectOverlay() {
  const canvas = this._cctvDetectOverlay;
  if (!canvas) return;
  canvas.hidden = true;
  const context = canvas.getContext('2d');
  context?.clearRect(0, 0, canvas.width, canvas.height);
}

/** Sembunyikan gambar hasil anotasi deteksi. */
export function _clearCctvDetectResult() {
  if (this._cctvDetectResultBlock) this._cctvDetectResultBlock.hidden = true;
  if (this._cctvDetectResult) this._cctvDetectResult.removeAttribute('src');
}

/**
 * Tampilkan gambar hasil anotasi dari layanan deteksi.
 *
 * Layanan YOLOv8 menggambar kotak, label, dan banner jumlah orang langsung
 * pada bingkai (persis demo repo Human-Detector) dan mengirimnya sebagai
 * JPEG base64 — tampil untuk SEMUA jenis kamera, termasuk HLS yang
 * pratinjau panelnya SVG sintetis.
 */
export function _showCctvDetectResult(result) {
  if (!this._cctvDetectResultBlock || !this._cctvDetectResult) return;
  const image = String(result?.annotated || '');
  if (!image) {
    this._clearCctvDetectResult();
    return;
  }
  this._cctvDetectResult.src = `data:image/jpeg;base64,${image}`;
  this._cctvDetectResultBlock.hidden = false;
}

/** Alih mode AUTO: deteksi ulang otomatis tiap selang untuk kamera aktif. */
export function _toggleCctvDetectAuto() {
  this._cctvDetectAuto = !this._cctvDetectAuto;
  const button = this._cctvDetectAutoBtn;
  if (button) {
    button.classList.toggle('active', this._cctvDetectAuto);
    button.setAttribute('aria-pressed', String(this._cctvDetectAuto));
    button.textContent = this._cctvDetectAuto ? 'AUTO AKTIF' : 'AUTO MATI';
  }
  if (this._cctvDetectAuto) {
    // Jalankan sekali sekarang, lalu ulangi selama AUTO menyala.
    this._runCctvPersonDetection();
    this._cctvDetectAutoTimer = setInterval(() => {
      if (this.destroyed || !this._cctvDetectAuto) return;
      // Kamera nonaktif (layer dimatikan) → tidur tanpa permintaan.
      if (!this._activeCctvCameraId()) return;
      if (this._cctvDetectBusy) return; // satu deteksi masih berjalan
      this._runCctvPersonDetection();
    }, AUTO_INTERVAL_MS);
  } else {
    clearInterval(this._cctvDetectAutoTimer);
    this._cctvDetectAutoTimer = null;
  }
}

/**
 * Gambar kotak-kotak hasil deteksi di atas pratinjau bingkai.
 *
 * Koordinat kotak berada di ruang bingkai asli (result.width ×
 * result.height); kanvas diskalakan ke ukuran tampil pratinjau.
 */
export function _drawCctvDetectOverlay(result) {
  const canvas = this._cctvDetectOverlay;
  const wrap = this._cctvFrameWrap;
  if (!canvas || !wrap) return;
  const frameWidth = Number(result?.width);
  const frameHeight = Number(result?.height);
  const persons = Array.isArray(result?.persons) ? result.persons : [];
  if (!frameWidth || !frameHeight || !persons.length) {
    this._clearCctvDetectOverlay();
    return;
  }
  const wrapWidth = wrap.clientWidth || canvas.clientWidth;
  const wrapHeight = wrap.clientHeight || canvas.clientHeight;
  if (!wrapWidth || !wrapHeight) {
    this._clearCctvDetectOverlay();
    return;
  }
  canvas.width = wrapWidth;
  canvas.height = wrapHeight;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const scaleX = canvas.width / frameWidth;
  const scaleY = canvas.height / frameHeight;
  // Warna kotak sama dengan app.py repo Human-Detector: rgb(37, 99, 235).
  context.strokeStyle = 'rgba(37, 99, 235, 0.95)';
  context.lineWidth = 2;
  context.font = '11px monospace';
  persons.forEach((person, index) => {
    const [x1, y1, x2, y2] = person.box;
    const left = x1 * scaleX;
    const top = y1 * scaleY;
    const boxWidth = (x2 - x1) * scaleX;
    const boxHeight = (y2 - y1) * scaleY;
    context.strokeRect(left, top, boxWidth, boxHeight);
    const label = `P${index + 1} ${Math.round(person.conf * 100)}%`;
    const textWidth = context.measureText(label).width;
    context.fillStyle = 'rgba(37, 99, 235, 0.95)';
    context.fillRect(left, Math.max(0, top - 14), textWidth + 8, 14);
    context.fillStyle = '#ffffff';
    context.fillText(label, left + 4, Math.max(10, top - 3));
  });
  canvas.hidden = false;
}

/**
 * Jalankan deteksi orang untuk kamera aktif dan tampilkan hasilnya.
 *
 * Dipanggil dari klik tombol DETECT; satu klik = satu permintaan. Layanan
 * deteksi yang mati dilaporkan apa adanya di chip, tanpa mengubah kamera.
 */
export async function _runCctvPersonDetection() {
  if (this.destroyed || !this._cctvDetectBtn) return;
  const cameraId = this._activeCctvCameraId();
  if (!cameraId) {
    this._setCctvDetectChip('PILIH KAMERA DULU', 'idle');
    return;
  }
  const button = this._cctvDetectBtn;
  button.disabled = true;
  this._cctvDetectBusy = true;
  this._setCctvDetectChip('DETEKSI · MEMUAT', 'loading');
  try {
    const response = await fetch(
      `/api/cctv/detect/${encodeURIComponent(cameraId)}`,
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      const reason = String(payload.error || `HTTP ${response.status}`);
      const offline = response.status === 0 || reason.includes('fetch failed');
      this._setCctvDetectChip(
        offline ? 'LAYANAN DETEKSI MATI' : `DETEKSI GAGAL · ${reason}`,
        'error',
      );
      this._clearCctvDetectOverlay();
      this._clearCctvDetectResult();
      return;
    }
    this._drawCctvDetectOverlay(payload);
    this._showCctvDetectResult(payload);
    const streamNote = payload.frameSource === 'upstream-stream' ? ' · LIVE' : '';
    this._setCctvDetectChip(`ORANG · ${payload.count}${streamNote}`, 'ok');
  } catch {
    this._setCctvDetectChip('LAYANAN DETEKSI MATI', 'error');
    this._clearCctvDetectOverlay();
    this._clearCctvDetectResult();
  } finally {
    this._cctvDetectBusy = false;
    if (!this.destroyed) button.disabled = false;
  }
}

/** Ikat tombol DETECT dan AUTO; dipanggil dari CctvControls. */
export function _initCctvDetectionControls() {
  if (!this._cctvDetectBtn) return;
  this.listen(this._cctvDetectBtn, 'click', () => {
    this._runCctvPersonDetection();
  });
  this.listen(this._cctvDetectAutoBtn, 'click', () => {
    this._toggleCctvDetectAuto();
  });
}
