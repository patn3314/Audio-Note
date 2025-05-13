/**
 * 音声処理モジュール
 * - マイク入力の取得と録音を管理
 * - 音声のリアルタイム分析と可視化データの提供
 * - 録音データの一時保存と処理
 */
class AudioProcessor {
    constructor() {
        // オーディオコンテキスト
        this.audioContext = null;
        
        // 録音関連のプロパティ
        this.mediaRecorder = null;
        this.audioStream = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.isPaused = false;
        
        // 音声分析用
        this.analyser = null;
        this.dataArray = null;
        this.bufferLength = 0;
        
        // 録音時間計測用
        this.recordingStartTime = 0;
        this.recordingDuration = 0;
        this.pauseStartTime = 0;
        this.totalPauseDuration = 0;
        
        // イベントリスナー
        this.onAudioProcess = null;
        this.onDataAvailable = null;
        this.onRecordingStop = null;
        
        // 音声特性データ収集用
        this.audioFeatures = [];
        
        // セグメントの管理用
        this.currentSegmentIndex = 0;
        this.segmentDuration = 30; // デフォルトは30秒
        this.segmentTimerId = null;
        
        // セッション識別用
        this.currentRecordingId = null;
    }
    
    /**
     * 音声処理を初期化
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            // AudioContextの初期化
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // マイク入力の取得
            this.audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }, 
                video: false 
            });
            
            // 音声分析用ノードの設定
            this.setupAudioNodes();
            
            return true;
        } catch (error) {
            console.error('音声処理の初期化に失敗しました:', error);
            return false;
        }
    }
    
    /**
     * 音声分析用のノードを設定
     * @private
     */
    setupAudioNodes() {
        const source = this.audioContext.createMediaStreamSource(this.audioStream);
        
        // アナライザーノードの作成と設定
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        
        // ソースをアナライザーに接続
        source.connect(this.analyser);
        
        // 音声特性抽出用のポーリング開始
        this.startFeatureExtraction();
    }
    
    /**
     * 録音を開始
     * @param {number} segmentDuration セグメントの長さ（秒）
     * @returns {Promise<number>} 録音ID
     */
    async startRecording(segmentDuration = 30) {
        if (this.isRecording) {
            return this.currentRecordingId;
        }
        
        try {
            // セグメント長を設定
            this.segmentDuration = segmentDuration;
            
            // 新しい録音セッションを作成
            this.currentRecordingId = await db.createRecording();
            
            // MediaRecorderの設定
            const options = { mimeType: 'audio/webm' };
            this.mediaRecorder = new MediaRecorder(this.audioStream, options);
            
            // イベントリスナーの設定
            this.mediaRecorder.ondataavailable = this.handleDataAvailable.bind(this);
            this.mediaRecorder.onstop = this.handleRecordingStop.bind(this);
            
            // 録音開始時の状態をリセット
            this.audioChunks = [];
            this.currentSegmentIndex = 0;
            this.recordingStartTime = Date.now();
            this.totalPauseDuration = 0;
            
            // 録音の開始
            this.mediaRecorder.start();
            this.isRecording = true;
            
            // 定期的なセグメント処理を開始
            this.startSegmentTimer();
            
            return this.currentRecordingId;
        } catch (error) {
            console.error('録音の開始に失敗しました:', error);
            return null;
        }
    }
    
    /**
     * 録音を一時停止
     */
    pauseRecording() {
        if (!this.isRecording || this.isPaused) {
            return;
        }
        
        this.mediaRecorder.pause();
        this.isPaused = true;
        this.pauseStartTime = Date.now();
        
        // セグメントタイマーを一時停止
        clearTimeout(this.segmentTimerId);
    }
    
    /**
     * 録音を再開
     */
    resumeRecording() {
        if (!this.isRecording || !this.isPaused) {
            return;
        }
        
        this.mediaRecorder.resume();
        this.isPaused = false;
        
        // 一時停止していた時間を加算
        this.totalPauseDuration += (Date.now() - this.pauseStartTime);
        
        // セグメントタイマーを再開
        this.startSegmentTimer();
    }
    
    /**
     * 録音を停止
     * @returns {Promise<Blob>} 録音された音声データのBlobオブジェクト
     */
    async stopRecording() {
        if (!this.isRecording) {
            return null;
        }
        
        return new Promise((resolve) => {
            const onStop = this.onRecordingStop;
            
            // 一時的なstopイベントハンドラを設定
            this.mediaRecorder.onstop = async () => {
                // 最終的な録音データをマージ
                const fullAudioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                
                // 録音の総時間を計算（ミリ秒から秒に変換）
                const duration = (Date.now() - this.recordingStartTime - this.totalPauseDuration) / 1000;
                
                // データベースの録音エントリを更新
                await db.updateRecordingBlob(this.currentRecordingId, fullAudioBlob, duration);
                
                // 状態のリセット
                this.isRecording = false;
                this.isPaused = false;
                clearTimeout(this.segmentTimerId);
                
                // コールバックを呼び出し
                if (onStop) {
                    onStop(this.currentRecordingId, fullAudioBlob, duration);
                }
                
                resolve(fullAudioBlob);
            };
            
            // 録音を停止
            this.mediaRecorder.stop();
        });
    }
    
    /**
     * データ利用可能イベントのハンドラ
     * @private
     * @param {BlobEvent} event 
     */
    async handleDataAvailable(event) {
        if (event.data && event.data.size > 0) {
            this.audioChunks.push(event.data);
            
            // コールバックを呼び出し
            if (this.onDataAvailable) {
                this.onDataAvailable(event.data);
            }
            
            // 現在のセグメントインデックスと時間を計算
            const currentTime = this.getCurrentRecordingTime();
            
            // 音声チャンクをデータベースに保存
            await db.saveAudioChunk(
                this.currentRecordingId,
                this.currentSegmentIndex,
                event.data,
                this.segmentDuration
            );
            
            // セグメントインデックスをインクリメント
            this.currentSegmentIndex++;
        }
    }
    
    /**
     * 録音停止イベントのデフォルトハンドラ
     * @private
     */
    handleRecordingStop() {
        // デフォルト実装は何もしない
        // イベントリスナーでオーバーライドする
    }
    
    /**
     * セグメント録音用タイマーを開始
     * @private
     */
    startSegmentTimer() {
        // 既存のタイマーをクリア
        if (this.segmentTimerId) {
            clearTimeout(this.segmentTimerId);
        }
        
        // セグメント長に応じたタイマーを設定
        this.segmentTimerId = setTimeout(() => {
            if (this.isRecording && !this.isPaused) {
                // 現在のデータをリクエスト
                this.mediaRecorder.requestData();
                
                // 次のセグメントのタイマーを設定
                this.startSegmentTimer();
            }
        }, this.segmentDuration * 1000);
    }
    
    /**
     * 現在の録音時間を取得（秒）
     * @returns {number} 録音時間（秒）
     */
    getCurrentRecordingTime() {
        if (!this.isRecording) {
            return 0;
        }
        
        let pauseTime = this.totalPauseDuration;
        if (this.isPaused) {
            pauseTime += (Date.now() - this.pauseStartTime);
        }
        
        return (Date.now() - this.recordingStartTime - pauseTime) / 1000;
    }
    
    /**
     * 可視化用の周波数データを取得
     * @returns {Uint8Array} 周波数データ
     */
    getVisualizationData() {
        if (!this.analyser) {
            return new Uint8Array(0);
        }
        
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }
    
    /**
     * 音声特性抽出の開始
     * @private
     */
    startFeatureExtraction() {
        const extractFeatures = () => {
            if (!this.analyser) return;
            
            // 周波数領域のデータを取得
            const freqData = new Float32Array(this.analyser.frequencyBinCount);
            this.analyser.getFloatFrequencyData(freqData);
            
            // 時間領域のデータを取得
            const timeData = new Float32Array(this.analyser.fftSize);
            this.analyser.getFloatTimeDomainData(timeData);
            
            // 音声特性を抽出して保存
            if (this.isRecording && !this.isPaused) {
                const features = this.extractAudioFeatures(freqData, timeData);
                this.audioFeatures.push({
                    time: this.getCurrentRecordingTime(),
                    features
                });
            }
            
            // 次のフレームでも実行
            requestAnimationFrame(extractFeatures);
        };
        
        // 特性抽出を開始
        extractFeatures();
    }
    
    /**
     * 音声データから特性を抽出
     * @private
     * @param {Float32Array} freqData 周波数領域データ
     * @param {Float32Array} timeData 時間領域データ
     * @returns {Object} 抽出された特性
     */
    extractAudioFeatures(freqData, timeData) {
        // 基本的な特性を計算
        const features = {
            // スペクトル重心（音色の特徴）
            spectralCentroid: this.calculateSpectralCentroid(freqData),
            
            // RMS（音量の指標）
            rms: this.calculateRMS(timeData),
            
            // スペクトルフラックス（音色の変化率）
            spectralFlux: this.calculateSpectralFlux(freqData),
            
            // ゼロクロッシングレート（基本周波数の近似）
            zeroCrossingRate: this.calculateZeroCrossingRate(timeData),
            
            // 周波数帯域ごとのエネルギー分布
            bandEnergies: this.calculateBandEnergies(freqData)
        };
        
        return features;
    }
    
    /**
     * スペクトル重心を計算（音色の特徴を表す）
     * @private
     * @param {Float32Array} freqData 
     * @returns {number}
     */
    calculateSpectralCentroid(freqData) {
        let numerator = 0;
        let denominator = 0;
        
        for (let i = 0; i < freqData.length; i++) {
            // dBを線形スケールに変換
            const magnitude = Math.pow(10, freqData[i] / 20);
            numerator += magnitude * i;
            denominator += magnitude;
        }
        
        return denominator !== 0 ? numerator / denominator : 0;
    }
    
    /**
     * RMS（二乗平均平方根）を計算（音量の指標）
     * @private
     * @param {Float32Array} timeData 
     * @returns {number}
     */
    calculateRMS(timeData) {
        let sum = 0;
        for (let i = 0; i < timeData.length; i++) {
            sum += timeData[i] * timeData[i];
        }
        return Math.sqrt(sum / timeData.length);
    }
    
    /**
     * スペクトルフラックスを計算（スペクトルの変化量）
     * @private
     * @param {Float32Array} freqData 
     * @returns {number}
     */
    calculateSpectralFlux(freqData) {
        if (!this.prevFreqData) {
            this.prevFreqData = new Float32Array(freqData.length);
            return 0;
        }
        
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
            const diff = Math.pow(10, freqData[i] / 20) - Math.pow(10, this.prevFreqData[i] / 20);
            sum += diff * diff;
        }
        
        // 前のフレームのデータを更新
        this.prevFreqData.set(freqData);
        
        return Math.sqrt(sum);
    }
    
    /**
     * ゼロクロッシングレートを計算（基本周波数の近似）
     * @private
     * @param {Float32Array} timeData 
     * @returns {number}
     */
    calculateZeroCrossingRate(timeData) {
        let count = 0;
        for (let i = 1; i < timeData.length; i++) {
            if ((timeData[i - 1] < 0 && timeData[i] >= 0) || 
                (timeData[i - 1] >= 0 && timeData[i] < 0)) {
                count++;
            }
        }
        return count / timeData.length;
    }
    
    /**
     * 周波数帯域ごとのエネルギー分布を計算
     * @private
     * @param {Float32Array} freqData 
     * @returns {Object} 帯域ごとのエネルギー
     */
    calculateBandEnergies(freqData) {
        const bands = {
            lowBand: 0,    // 低域（〜500Hz）
            midBand: 0,    // 中域（500Hz〜2kHz）
            highBand: 0    // 高域（2kHz〜）
        };
        
        const nyquist = this.audioContext.sampleRate / 2;
        const lowCutoff = 500 / nyquist * freqData.length;
        const midCutoff = 2000 / nyquist * freqData.length;
        
        // 各帯域のエネルギーを計算
        for (let i = 0; i < freqData.length; i++) {
            // dBから線形スケールへ変換
            const magnitude = Math.pow(10, freqData[i] / 20);
            
            if (i < lowCutoff) {
                bands.lowBand += magnitude;
            } else if (i < midCutoff) {
                bands.midBand += magnitude;
            } else {
                bands.highBand += magnitude;
            }
        }
        
        return bands;
    }
    
    /**
     * 録音された音声特性データを取得
     * @returns {Array} 時系列の音声特性データ
     */
    getAudioFeatures() {
        return this.audioFeatures;
    }
    
    /**
     * 音声特性データをリセット
     */
    resetAudioFeatures() {
        this.audioFeatures = [];
    }
    
    /**
     * リソースを解放
     */
    dispose() {
        // タイマーをクリア
        if (this.segmentTimerId) {
            clearTimeout(this.segmentTimerId);
        }
        
        // 録音を停止
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
        }
        
        // ストリームの全てのトラックを停止
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
        }
        
        // AudioContextを閉じる
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}
