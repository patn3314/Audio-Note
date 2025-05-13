/**
 * 音声認識モジュール
 * - Transformers.jsを使用したWhisperモデルによる音声認識
 * - 録音された音声データをテキストに変換
 */
class SpeechRecognizer {
    constructor() {
        // モデル情報
        this.models = {
            'whisper-tiny': 'Xenova/whisper-tiny',
            'whisper-base': 'Xenova/whisper-base',
            'whisper-small': 'Xenova/whisper-small'
        };
        
        // 現在のモデル
        this.currentModelId = 'whisper-tiny';
        this.model = null;
        this.processor = null;
        
        // 音声認識タスクの状態
        this.isLoading = false;
        this.isProcessing = false;
        
        // イベントコールバック
        this.onModelLoad = null;
        this.onTranscriptionStart = null;
        this.onTranscriptionProgress = null;
        this.onTranscriptionComplete = null;
        this.onError = null;
    }
    
    /**
     * 音声認識モデルを初期化
     * @param {string} modelId モデルID
     * @returns {Promise<boolean>} 初期化の成否
     */
    async initialize(modelId = 'whisper-tiny') {
        // モデルIDが無効な場合はデフォルトを使用
        if (!this.models[modelId]) {
            modelId = 'whisper-tiny';
        }
        
        try {
            this.isLoading = true;
            
            // コールバックを呼び出し
            if (this.onModelLoad) {
                this.onModelLoad({ status: 'loading', model: modelId });
            }
            
            // Transformers.jsのpipelineを初期化
            this.processor = await pipeline(
                'automatic-speech-recognition',
                this.models[modelId],
                {
                    revision: 'main',
                    quantized: false,
                    progress_callback: this.handleModelLoadProgress.bind(this)
                }
            );
            
            this.currentModelId = modelId;
            this.isLoading = false;
            
            // コールバックを呼び出し
            if (this.onModelLoad) {
                this.onModelLoad({ status: 'loaded', model: modelId });
            }
            
            return true;
        } catch (error) {
            this.isLoading = false;
            console.error('音声認識モデルの初期化に失敗しました:', error);
            
            // エラーコールバックを呼び出し
            if (this.onError) {
                this.onError({
                    phase: 'initialization',
                    error: error.message || 'モデルの読み込みに失敗しました'
                });
            }
            
            return false;
        }
    }
    
    /**
     * モデル読み込みの進捗を処理
     * @param {Object} progress 
     */
    handleModelLoadProgress(progress) {
        // コールバックを呼び出し
        if (this.onModelLoad) {
            this.onModelLoad({
                status: 'loading',
                model: this.currentModelId,
                progress
            });
        }
    }
    
    /**
     * 音声データから文字起こしを実行
     * @param {Blob|ArrayBuffer|String} audioData 音声データ
     * @param {Object} options オプション
     * @returns {Promise<Object>} 文字起こし結果
     */
    async transcribe(audioData, options = {}) {
        if (!this.processor) {
            throw new Error('音声認識モデルが初期化されていません');
        }
        
        if (this.isProcessing) {
            throw new Error('既に処理中のタスクがあります');
        }
        
        try {
            this.isProcessing = true;
            
            // 開始コールバックを呼び出し
            if (this.onTranscriptionStart) {
                this.onTranscriptionStart();
            }
            
            // 進捗コールバック関数の設定
            const progressCallback = (progress) => {
                if (this.onTranscriptionProgress) {
                    this.onTranscriptionProgress(progress);
                }
            };
            
            // 音声認識オプションの設定
            const transcriptionOptions = {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: 'japanese',
                return_timestamps: true,
                ...options,
                callback_function: progressCallback
            };
            
            // 音声認識を実行
            const result = await this.processor(audioData, transcriptionOptions);
            
            // 結果の後処理
            const processedResult = this.postProcessTranscription(result);
            
            // 完了コールバックを呼び出し
            if (this.onTranscriptionComplete) {
                this.onTranscriptionComplete(processedResult);
            }
            
            this.isProcessing = false;
            return processedResult;
            
        } catch (error) {
            this.isProcessing = false;
            console.error('文字起こしに失敗しました:', error);
            
            // エラーコールバックを呼び出し
            if (this.onError) {
                this.onError({
                    phase: 'transcription',
                    error: error.message || '文字起こし処理中にエラーが発生しました'
                });
            }
            
            throw error;
        }
    }
    
    /**
     * 文字起こし結果の後処理
     * @private
     * @param {Object} result Whisperからの生の結果
     * @returns {Object} 処理済みの結果
     */
    postProcessTranscription(result) {
        // 単語レベルのタイムスタンプがある場合はそれを使用
        const chunks = result.chunks || [];
        
        // 文単位のセグメントを取得
        const text = result.text || '';
        
        // タイムスタンプがある場合は構造化された結果を返す
        if (chunks.length > 0) {
            return {
                text,
                chunks,
                language: result.language,
                duration: chunks.length > 0 ? chunks[chunks.length - 1].timestamp[1] : 0
            };
        }
        
        // タイムスタンプがない場合はテキストのみ返す
        return {
            text,
            chunks: [],
            language: result.language || 'ja',
            duration: 0
        };
    }
    
    /**
     * 現在のモデルIDを取得
     * @returns {string} モデルID
     */
    getCurrentModelId() {
        return this.currentModelId;
    }
    
    /**
     * モデルが読み込み中かどうかを確認
     * @returns {boolean}
     */
    isModelLoading() {
        return this.isLoading;
    }
    
    /**
     * 処理中かどうかを確認
     * @returns {boolean}
     */
    isCurrentlyProcessing() {
        return this.isProcessing;
    }
}

// pipeline関数のエイリアス
const { pipeline } = window.transformers || {};
