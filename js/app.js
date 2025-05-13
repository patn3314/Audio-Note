/**
 * メインアプリケーションモジュール
 * - UIイベントの処理
 * - 各モジュールの連携と制御
 */
document.addEventListener('DOMContentLoaded', () => {
    // モジュールのインスタンス化
    const audioProcessor = new AudioProcessor();
    const speechRecognizer = new SpeechRecognizer();
    const diarization = new SpeakerDiarization();
    const exporter = new TranscriptExporter();
    
    // UIエレメントの参照を取得
    const startButton = document.getElementById('start-button');
    const pauseButton = document.getElementById('pause-button');
    const stopButton = document.getElementById('stop-button');
    const statusText = document.getElementById('status');
    const recordingTime = document.getElementById('recording-time');
    const processingStatus = document.getElementById('processing-status');
    const progressValue = document.getElementById('progress-value');
    const transcriptContent = document.getElementById('transcript-content');
    const themeSwitch = document.getElementById('theme-switch');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingMessage = document.getElementById('loading-message');
    
    // エクスポートボタン
    const copyButton = document.getElementById('copy-button');
    const exportMarkdown = document.getElementById('export-markdown');
    const exportCsv = document.getElementById('export-csv');
    const exportText = document.getElementById('export-text');
    
    // 設定関連
    const settingsButton = document.getElementById('settings-button');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.querySelector('.close');
    const saveSettingsBtn = document.getElementById('save-settings');
    const resetSettingsBtn = document.getElementById('reset-settings');
    const modelSelection = document.getElementById('model-selection');
    const segmentDuration = document.getElementById('segment-duration');
    const maxSpeakers = document.getElementById('max-speakers');
    
    // 可視化
    const visualizer = new AudioVisualizer(document.getElementById('visualizer'));
    
    // アプリの状態
    let appState = {
        isInitialized: false,
        isRecording: false,
        isPaused: false,
        isDarkTheme: false,
        currentRecordingId: null,
        recordingTimer: null,
        transcriptSegments: [], // 現在の文字起こし結果
        speakerNames: {         // カスタム話者名
            'A': '発話者A',
            'B': '発話者B',
            'C': '発話者C'
        }
    };
    
    // 設定のデフォルト値
    const defaultSettings = {
        modelId: 'whisper-tiny',
        segmentDuration: 30,
        maxSpeakers: 3
    };
    
    // 設定の取得と適用
    let appSettings = loadSettings() || { ...defaultSettings };
    applySettings(appSettings);
    
    /**
     * アプリケーションの初期化
     */
    async function initApp() {
        showLoading('Audio Noteを初期化しています...');
        
        try {
            // 音声処理の初期化
            const audioInitialized = await audioProcessor.initialize();
            if (!audioInitialized) {
                throw new Error('音声処理の初期化に失敗しました');
            }
            
            // 音声認識モデルの初期化
            const modelInitialized = await speechRecognizer.initialize(appSettings.modelId);
            if (!modelInitialized) {
                throw new Error('音声認識モデルの初期化に失敗しました');
            }
            
            // 話者分離の設定
            diarization.setMaxSpeakers(appSettings.maxSpeakers);
            
            // イベントリスナーのセットアップ
            setupEventListeners();
            
            // テーマの初期設定
            setupTheme();
            
            // 初期化完了
            appState.isInitialized = true;
            updateUIState();
            hideLoading();
            
        } catch (error) {
            console.error('アプリケーションの初期化に失敗しました:', error);
            statusText.textContent = 'エラー: ' + error.message;
            hideLoading();
        }
    }
    
    /**
     * イベントリスナーのセットアップ
     */
    function setupEventListeners() {
        // 録音コントロール
        startButton.addEventListener('click', startRecording);
        pauseButton.addEventListener('click', togglePauseRecording);
        stopButton.addEventListener('click', stopRecording);
        
        // エクスポート関連
        copyButton.addEventListener('click', copyTranscriptToClipboard);
        exportMarkdown.addEventListener('click', () => exportTranscript('markdown'));
        exportCsv.addEventListener('click', () => exportTranscript('csv'));
        exportText.addEventListener('click', () => exportTranscript('text'));
        
        // 設定関連
        settingsButton.addEventListener('click', openSettings);
        closeModalBtn.addEventListener('click', closeSettings);
        saveSettingsBtn.addEventListener('click', saveSettings);
        resetSettingsBtn.addEventListener('click', resetSettings);
        
        // テーマ切り替え
        themeSwitch.addEventListener('change', toggleTheme);
        
        // 話者名カスタマイズ
        document.querySelectorAll('.speaker-name').forEach(input => {
            input.addEventListener('change', updateSpeakerName);
        });
        
        // ヘルプボタン
        document.getElementById('help-button').addEventListener('click', showHelp);
        
        // グローバルなクリックイベント（モーダル外クリックで閉じる）
        window.addEventListener('click', (event) => {
            if (event.target === settingsModal) {
                closeSettings();
            }
        });
        
        // モデル読み込みイベント
        speechRecognizer.onModelLoad = handleModelLoadEvent;
        
        // 文字起こしイベント
        speechRecognizer.onTranscriptionStart = () => {
            processingStatus.textContent = '文字起こし処理中...';
            progressValue.style.width = '10%';
        };
        
        speechRecognizer.onTranscriptionProgress = (progress) => {
            progressValue.style.width = `${10 + progress.progress * 40}%`;
        };
        
        speechRecognizer.onTranscriptionComplete = (result) => {
            progressValue.style.width = '50%';
            processingStatus.textContent = '話者分離処理中...';
        };
        
        // 話者分離イベント
        diarization.onProcessingStart = () => {
            processingStatus.textContent = '話者分離処理中...';
            progressValue.style.width = '60%';
        };
        
        diarization.onProcessingProgress = (data) => {
            progressValue.style.width = `${60 + data.progress * 40}%`;
            processingStatus.textContent = data.message;
        };
        
        diarization.onProcessingComplete = (result) => {
            processingStatus.textContent = '完了';
            progressValue.style.width = '100%';
            
            // 結果を保存
            appState.transcriptSegments = result.segments;
            
            // UIに表示
            renderTranscript(result.segments);
            
            // 3秒後にプログレスバーをリセット
            setTimeout(() => {
                processingStatus.textContent = '待機中';
                progressValue.style.width = '0%';
            }, 3000);
        };
    }
    
    /**
     * 録音を開始
     */
    async function startRecording() {
        if (appState.isRecording) return;
        
        try {
            // AudioContext が停止している場合は再開
            if (audioProcessor.audioContext.state === 'suspended') {
                await audioProcessor.audioContext.resume();
            }
            
            // 録音開始
            const recordingId = await audioProcessor.startRecording(appSettings.segmentDuration);
            if (!recordingId) {
                throw new Error('録音の開始に失敗しました');
            }
            
            // アプリ状態を更新
            appState.isRecording = true;
            appState.isPaused = false;
            appState.currentRecordingId = recordingId;
            
            // 録音時間の表示を開始
            startRecordingTimer();
            
            // 可視化を開始
            visualizer.start(() => audioProcessor.getVisualizationData());
            
            // UI状態を更新
            updateUIState();
            
            // 音声特性をリセット
            audioProcessor.resetAudioFeatures();
            
        } catch (error) {
            console.error('録音の開始に失敗しました:', error);
            statusText.textContent = 'エラー: ' + error.message;
        }
    }
    
    /**
     * 録音を一時停止/再開
     */
    function togglePauseRecording() {
        if (!appState.isRecording) return;
        
        if (appState.isPaused) {
            // 録音を再開
            audioProcessor.resumeRecording();
            appState.isPaused = false;
            pauseButton.innerHTML = '<i class="fas fa-pause"></i> 一時停止';
            statusText.textContent = '録音中';
        } else {
            // 録音を一時停止
            audioProcessor.pauseRecording();
            appState.isPaused = true;
            pauseButton.innerHTML = '<i class="fas fa-play"></i> 再開';
            statusText.textContent = '一時停止中';
        }
    }
    
    /**
     * 録音を停止して文字起こしを開始
     */
    async function stopRecording() {
        if (!appState.isRecording) return;
        
        try {
            // 録音タイマーを停止
            stopRecordingTimer();
            
            // 可視化を停止
            visualizer.stop();
            
            // 録音を停止
            const audioBlob = await audioProcessor.stopRecording();
            
            // アプリ状態を更新
            appState.isRecording = false;
            appState.isPaused = false;
            
            // UI状態を更新
            updateUIState();
            
            // 文字起こし処理を開始
            statusText.textContent = '処理中...';
            processingStatus.textContent = 'モデル準備中...';
            progressValue.style.width = '5%';
            
            // 音声特性データを取得
            const audioFeatures = audioProcessor.getAudioFeatures();
            
            // 文字起こし処理
            const transcriptionResult = await speechRecognizer.transcribe(audioBlob, {
                language: 'japanese',
                return_timestamps: true
            });
            
            // 話者分離処理
            const diarizationResult = await diarization.processDiarization(
                audioFeatures, 
                transcriptionResult
            );
            
            // 文字起こし結果をデータベースに保存
            await db.saveTranscript(appState.currentRecordingId, diarizationResult.segments);
            
            // 処理完了
            statusText.textContent = '準備完了';
            
        } catch (error) {
            console.error('録音の停止または処理中にエラーが発生しました:', error);
            statusText.textContent = 'エラー: ' + error.message;
            processingStatus.textContent = 'エラーが発生しました';
            progressValue.style.width = '0%';
        }
    }
    
    /**
     * 文字起こし結果をUIに表示
     * @param {Array} segments 文字起こしセグメント
     */
    function renderTranscript(segments) {
        if (!segments || segments.length === 0) {
            transcriptContent.innerHTML = '<div class="no-transcript">文字起こし結果がありません</div>';
            return;
        }
        
        let html = '';
        
        segments.forEach(segment => {
            // 話者名を取得（カスタム名があればそれを使用）
            const speakerName = appState.speakerNames[segment.speaker] || `発話者${segment.speaker}`;
            
            // 話者ごとの色を設定
            const speakerColor = getSpeakerColor(segment.speaker);
            
            // 開始・終了時間をフォーマット
            const startTime = formatTime(segment.start);
            const endTime = formatTime(segment.end);
            
            html += `
                <div class="transcript-entry">
                    <div class="speaker-header">
                        <span class="speaker-label">
                            <span class="speaker-color" style="background-color: ${speakerColor};"></span>
                            ${speakerName}
                        </span>
                        <span class="transcript-time">${startTime} - ${endTime}</span>
                    </div>
                    <div class="transcript-text">${segment.text}</div>
                </div>
            `;
        });
        
        transcriptContent.innerHTML = html;
        
        // スクロールを一番下に
        transcriptContent.scrollTop = transcriptContent.scrollHeight;
    }
    
    /**
     * 話者名を更新
     * @param {Event} event 
     */
    function updateSpeakerName(event) {
        const input = event.target;
        const speakerId = input.parentElement.getAttribute('data-speaker');
        
        if (speakerId) {
            appState.speakerNames[speakerId] = input.value;
            
            // 既存のトランスクリプトを再描画
            if (appState.transcriptSegments.length > 0) {
                renderTranscript(appState.transcriptSegments);
            }
        }
    }
    
    /**
     * 話者IDに基づいて色を返す
     * @param {string} speakerId 
     * @returns {string} カラーコード
     */
    function getSpeakerColor(speakerId) {
        const colors = {
            'A': '#4285f4', // 青
            'B': '#ea4335', // 赤
            'C': '#fbbc05', // 黄
            'D': '#34a853', // 緑
            'E': '#673ab7', // 紫
            'F': '#ff6d00', // オレンジ
            'Unknown': '#9aa0a6' // グレー
        };
        
        return colors[speakerId] || colors['Unknown'];
    }
    
    /**
     * 秒数を時間表記（HH:MM:SS）に変換
     * @param {number} seconds 
     * @returns {string} フォーマットされた時間
     */
    function formatTime(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        const parts = [
            hrs > 0 ? String(hrs).padStart(2, '0') : null,
            String(mins).padStart(2, '0'),
            String(secs).padStart(2, '0')
        ].filter(Boolean);
        
        return parts.join(':');
    }
    
    /**
     * 録音時間の表示を開始
     */
    function startRecordingTimer() {
        if (appState.recordingTimer) {
            clearInterval(appState.recordingTimer);
        }
        
        appState.recordingTimer = setInterval(() => {
            const currentTime = audioProcessor.getCurrentRecordingTime();
            recordingTime.textContent = formatTime(currentTime);
        }, 1000);
    }
    
    /**
     * 録音時間の表示を停止
     */
    function stopRecordingTimer() {
        if (appState.recordingTimer) {
            clearInterval(appState.recordingTimer);
            appState.recordingTimer = null;
        }
    }
    
    /**
     * UIの状態を更新
     */
    function updateUIState() {
        if (!appState.isInitialized) {
            startButton.disabled = true;
            pauseButton.disabled = true;
            stopButton.disabled = true;
            statusText.textContent = '初期化中...';
            return;
        }
        
        if (appState.isRecording) {
            startButton.disabled = true;
            pauseButton.disabled = false;
            stopButton.disabled = false;
            statusText.textContent = appState.isPaused ? '一時停止中' : '録音中';
        } else {
            startButton.disabled = false;
            pauseButton.disabled = true;
            stopButton.disabled = true;
            statusText.textContent = '準備完了';
        }
    }
    
    /**
     * モデル読み込みイベントの処理
     * @param {Object} event 
     */
    function handleModelLoadEvent(event) {
        if (event.status === 'loading') {
            if (event.progress) {
                const percent = Math.round(event.progress.progress * 100);
                loadingMessage.textContent = `モデルを読み込んでいます (${percent}%)...`;
            } else {
                loadingMessage.textContent = 'モデルを読み込んでいます...';
            }
        } else if (event.status === 'loaded') {
            loadingMessage.textContent = 'モデルの読み込みが完了しました';
        }
    }
    
    /**
     * テーマ設定の初期化
     */
    function setupTheme() {
        // ローカルストレージからテーマ設定を取得
        const savedTheme = localStorage.getItem('audioNoteTheme');
        
        if (savedTheme === 'dark') {
            applyDarkTheme();
            themeSwitch.checked = true;
        } else {
            applyLightTheme();
            themeSwitch.checked = false;
        }
    }
    
    /**
     * テーマの切り替え
     */
    function toggleTheme() {
        if (themeSwitch.checked) {
            applyDarkTheme();
            localStorage.setItem('audioNoteTheme', 'dark');
        } else {
            applyLightTheme();
            localStorage.setItem('audioNoteTheme', 'light');
        }
    }
    
    /**
     * ダークテーマの適用
     */
    function applyDarkTheme() {
        document.body.classList.add('dark-theme');
        appState.isDarkTheme = true;
        visualizer.setTheme(true);
    }
    
    /**
     * ライトテーマの適用
     */
    function applyLightTheme() {
        document.body.classList.remove('dark-theme');
        appState.isDarkTheme = false;
        visualizer.setTheme(false);
    }
    
    /**
     * 設定ダイアログを開く
     */
    function openSettings() {
        // 現在の設定を表示
        modelSelection.value = appSettings.modelId;
        segmentDuration.value = appSettings.segmentDuration;
        maxSpeakers.value = appSettings.maxSpeakers;
        
        settingsModal.style.display = 'block';
    }
    
    /**
     * 設定ダイアログを閉じる
     */
    function closeSettings() {
        settingsModal.style.display = 'none';
    }
    
    /**
     * 設定を保存
     */
    async function saveSettings() {
        // 設定値を取得
        const newSettings = {
            modelId: modelSelection.value,
            segmentDuration: parseInt(segmentDuration.value, 10),
            maxSpeakers: parseInt(maxSpeakers.value, 10)
        };
        
        // モデルが変更された場合は再読み込み
        const modelChanged = newSettings.modelId !== appSettings.modelId;
        
        // 設定を保存
        appSettings = newSettings;
        saveSettingsToStorage(appSettings);
        
        // 設定を適用
        applySettings(appSettings);
        
        // モデルの再読み込み
        if (modelChanged && appState.isInitialized) {
            showLoading('モデルを変更しています...');
            try {
                await speechRecognizer.initialize(appSettings.modelId);
            } catch (error) {
                console.error('モデルの変更に失敗しました:', error);
            }
            hideLoading();
        }
        
        // 設定ダイアログを閉じる
        closeSettings();
    }
    
    /**
     * 設定をリセット
     */
    function resetSettings() {
        modelSelection.value = defaultSettings.modelId;
        segmentDuration.value = defaultSettings.segmentDuration;
        maxSpeakers.value = defaultSettings.maxSpeakers;
    }
    
    /**
     * 設定をローカルストレージから読み込み
     * @returns {Object|null} 保存された設定
     */
    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem('audioNoteSettings');
            return savedSettings ? JSON.parse(savedSettings) : null;
        } catch (error) {
            console.error('設定の読み込みに失敗しました:', error);
            return null;
        }
    }
    
    /**
     * 設定をローカルストレージに保存
     * @param {Object} settings 
     */
    function saveSettingsToStorage(settings) {
        try {
            localStorage.setItem('audioNoteSettings', JSON.stringify(settings));
        } catch (error) {
            console.error('設定の保存に失敗しました:', error);
        }
    }
    
    /**
     * 設定を適用
     * @param {Object} settings 
     */
    function applySettings(settings) {
        if (settings.maxSpeakers) {
            diarization.setMaxSpeakers(settings.maxSpeakers);
        }
    }
    
    /**
     * 文字起こし結果をクリップボードにコピー
     */
    function copyTranscriptToClipboard() {
        if (appState.transcriptSegments.length === 0) {
            alert('コピーする文字起こし結果がありません');
            return;
        }
        
        // プレーンテキスト形式で出力
        const textContent = exporter.exportToText(
            appState.transcriptSegments,
            { speakerNames: appState.speakerNames }
        );
        
        navigator.clipboard.writeText(textContent)
            .then(() => {
                const originalText = copyButton.innerHTML;
                copyButton.innerHTML = '<i class="fas fa-check"></i> コピー完了';
                
                setTimeout(() => {
                    copyButton.innerHTML = originalText;
                }, 2000);
            })
            .catch(err => {
                console.error('クリップボードへのコピーに失敗しました:', err);
                alert('クリップボードへのコピーに失敗しました');
            });
    }
    
    /**
     * 文字起こし結果をエクスポート
     * @param {string} format フォーマット ('markdown'|'csv'|'text')
     */
    function exportTranscript(format) {
        if (appState.transcriptSegments.length === 0) {
            alert('エクスポートする文字起こし結果がありません');
            return;
        }
        
        try {
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
            let content, filename;
            
            // スピーカー名を取得
            const speakerNames = { ...appState.speakerNames };
            
            switch (format) {
                case 'markdown':
                    content = exporter.exportToMarkdown(
                        appState.transcriptSegments,
                        { speakerNames }
                    );
                    filename = `transcript_${timestamp}.md`;
                    break;
                    
                case 'csv':
                    content = exporter.exportToCSV(
                        appState.transcriptSegments,
                        { speakerNames }
                    );
                    filename = `transcript_${timestamp}.csv`;
                    break;
                    
                case 'text':
                default:
                    content = exporter.exportToText(
                        appState.transcriptSegments,
                        { speakerNames }
                    );
                    filename = `transcript_${timestamp}.txt`;
                    break;
            }
            
            exporter.downloadFile(content, filename);
            
        } catch (error) {
            console.error('エクスポート中にエラーが発生しました:', error);
            alert('エクスポート中にエラーが発生しました');
        }
    }
    
    /**
     * ヘルプ情報を表示
     */
    function showHelp() {
        alert(
            'Audio Note - 使い方ガイド\n\n' +
            '録音開始: 「録音開始」ボタンをクリックすると録音が始まります\n' +
            '一時停止/再開: 録音中に「一時停止」ボタンで録音を一時停止できます\n' +
            '録音停止: 「録音停止」ボタンで録音を終了し、自動的に文字起こし処理が開始されます\n\n' +
            '話者名の変更: 文字起こし結果の上部にある「発話者A」などの名前を直接編集できます\n' +
            '結果のエクスポート: 「エクスポート」ボタンからMarkdown、CSV、テキスト形式で保存できます\n\n' +
            '設定: 画面下部の「設定」ボタンから音声認識モデルや最大話者数などを変更できます'
        );
    }
    
    /**
     * ローディングオーバーレイを表示
     * @param {string} message 表示するメッセージ
     */
    function showLoading(message = 'ロード中...') {
        loadingMessage.textContent = message;
        loadingOverlay.classList.add('active');
    }
    
    /**
     * ローディングオーバーレイを非表示
     */
    function hideLoading() {
        loadingOverlay.classList.remove('active');
    }
    
    // アプリケーションの初期化を開始
    initApp();
});
