/**
 * データベース操作モジュール
 * - 録音データと文字起こし結果をクライアント側で保存するためのローカルデータベースを管理
 */
class AudioDatabase {
    constructor() {
        this.db = new Dexie('AudioNote');
        this.db.version(1).stores({
            recordings: '++id, name, date, duration, blob',
            transcripts: 'recordingId, segments, createdAt',
            audioChunks: 'recordingId, chunkIndex, audioBlob, duration'
        });
    }

    /**
     * 新しい録音セッションを作成
     * @param {string} name 録音の名前
     * @returns {Promise<number>} 録音ID
     */
    async createRecording(name = '新規録音') {
        const now = new Date();
        const id = await this.db.recordings.add({
            name: name,
            date: now.toISOString(),
            duration: 0,
            blob: null
        });
        return id;
    }

    /**
     * 音声チャンクを保存
     * @param {number} recordingId 録音ID
     * @param {number} chunkIndex チャンクのインデックス
     * @param {Blob} audioBlob 音声データのBlob
     * @param {number} duration チャンクの長さ（秒）
     * @returns {Promise<number>} チャンクID
     */
    async saveAudioChunk(recordingId, chunkIndex, audioBlob, duration) {
        return await this.db.audioChunks.add({
            recordingId,
            chunkIndex,
            audioBlob,
            duration
        });
    }

    /**
     * 録音の最終的なBlobを更新
     * @param {number} recordingId 録音ID
     * @param {Blob} audioBlob 音声データのBlob
     * @param {number} duration 録音の総時間（秒）
     * @returns {Promise<number>}
     */
    async updateRecordingBlob(recordingId, audioBlob, duration) {
        return await this.db.recordings.update(recordingId, {
            blob: audioBlob,
            duration: duration
        });
    }

    /**
     * 文字起こし結果を保存
     * @param {number} recordingId 録音ID
     * @param {Array} segments 文字起こしセグメント
     * @returns {Promise<number>} 
     */
    async saveTranscript(recordingId, segments) {
        // すでに存在する場合は上書き、なければ新規作成
        const existingTranscript = await this.db.transcripts
            .where({ recordingId })
            .first();
        
        if (existingTranscript) {
            return await this.db.transcripts.update(recordingId, {
                segments: segments,
                updatedAt: new Date().toISOString()
            });
        } else {
            return await this.db.transcripts.add({
                recordingId,
                segments,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
    }

    /**
     * 録音セッションの一覧を取得
     * @returns {Promise<Array>} 録音セッションの配列
     */
    async getRecordings() {
        return await this.db.recordings.toArray();
    }

    /**
     * 特定の録音に関連付けられた音声チャンクを取得
     * @param {number} recordingId 録音ID
     * @returns {Promise<Array>} 音声チャンクの配列
     */
    async getAudioChunks(recordingId) {
        return await this.db.audioChunks
            .where({ recordingId })
            .sortBy('chunkIndex');
    }

    /**
     * 特定の録音の文字起こし結果を取得
     * @param {number} recordingId 録音ID
     * @returns {Promise<Object|null>} 文字起こし結果オブジェクト
     */
    async getTranscript(recordingId) {
        return await this.db.transcripts
            .where({ recordingId })
            .first();
    }

    /**
     * 特定の録音とその関連データをすべて削除
     * @param {number} recordingId 録音ID
     * @returns {Promise<void>}
     */
    async deleteRecording(recordingId) {
        await this.db.transaction('rw', 
            this.db.recordings, 
            this.db.audioChunks, 
            this.db.transcripts, 
            async () => {
                await this.db.audioChunks
                    .where({ recordingId })
                    .delete();
                
                await this.db.transcripts
                    .where({ recordingId })
                    .delete();
                
                await this.db.recordings
                    .where({ id: recordingId })
                    .delete();
            });
    }

    /**
     * データベース内のデータをすべて消去
     * @returns {Promise<void>}
     */
    async clearAllData() {
        await this.db.transaction('rw',
            this.db.recordings,
            this.db.audioChunks,
            this.db.transcripts,
            async () => {
                await this.db.audioChunks.clear();
                await this.db.transcripts.clear();
                await this.db.recordings.clear();
            });
    }
}

// グローバルインスタンスを作成
const db = new AudioDatabase();
