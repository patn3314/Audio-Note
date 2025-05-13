/**
 * 話者分離モジュール
 * - 録音された音声の特性分析と話者分離
 * - 話者ごとのセグメント特定
 */
class SpeakerDiarization {
    constructor() {
        // 設定
        this.maxSpeakers = 3;
        this.minSegmentDuration = 1.0; // 最小セグメント長（秒）
        this.mergeThreshold = 0.5;    // 類似セグメントのマージしきい値
        
        // 処理状態
        this.isProcessing = false;
        
        // イベントコールバック
        this.onProcessingStart = null;
        this.onProcessingProgress = null;
        this.onProcessingComplete = null;
        this.onError = null;
    }
    
    /**
     * 最大話者数を設定
     * @param {number} count 
     */
    setMaxSpeakers(count) {
        this.maxSpeakers = Math.max(1, Math.min(10, count));
    }
    
    /**
     * 音声特性データと文字起こし結果から話者分離を実行
     * @param {Array} audioFeatures 音声特性データ
     * @param {Object} transcription 文字起こし結果
     * @returns {Promise<Object>} 話者分離された文字起こし結果
     */
    async processDiarization(audioFeatures, transcription) {
        if (this.isProcessing) {
            throw new Error('既に処理中のタスクがあります');
        }
        
        try {
            this.isProcessing = true;
            
            // 開始コールバックを呼び出し
            if (this.onProcessingStart) {
                this.onProcessingStart();
            }
            
            // 進捗更新
            this.updateProgress(0.1, '特性ベクトルを抽出中...');
            
            // 特性ベクトルの抽出
            const featureVectors = this.extractFeatureVectors(audioFeatures);
            
            // 進捗更新
            this.updateProgress(0.3, 'クラスタリング中...');
            
            // クラスタリングによる話者分離
            const clusters = await this.clusterFeatureVectors(featureVectors, this.maxSpeakers);
            
            // 進捗更新
            this.updateProgress(0.6, 'セグメントに話者を割り当て中...');
            
            // 話者ラベルをセグメントに割り当て
            const labeledSegments = this.assignSpeakersToSegments(
                clusters, 
                featureVectors, 
                transcription.chunks
            );
            
            // 進捗更新
            this.updateProgress(0.8, 'セグメントを最適化中...');
            
            // 話者セグメントの最適化
            const optimizedSegments = this.optimizeSegments(labeledSegments);
            
            // 結果の構築
            const result = {
                text: transcription.text,
                segments: optimizedSegments,
                speakers: this.extractUniqueSpeakers(optimizedSegments)
            };
            
            // 進捗更新
            this.updateProgress(1.0, '完了');
            
            // 完了コールバックを呼び出し
            if (this.onProcessingComplete) {
                this.onProcessingComplete(result);
            }
            
            this.isProcessing = false;
            return result;
            
        } catch (error) {
            this.isProcessing = false;
            console.error('話者分離に失敗しました:', error);
            
            // エラーコールバックを呼び出し
            if (this.onError) {
                this.onError({
                    phase: 'diarization',
                    error: error.message || '話者分離処理中にエラーが発生しました'
                });
            }
            
            throw error;
        }
    }
    
    /**
     * 音声特性データから特性ベクトルを抽出
     * @private
     * @param {Array} audioFeatures 
     * @returns {Array} 特性ベクトルの配列
     */
    extractFeatureVectors(audioFeatures) {
        return audioFeatures.map(frame => {
            const { time, features } = frame;
            
            // 特性値を配列に変換
            const vector = [
                features.spectralCentroid,
                features.rms * 100, // スケールの調整
                features.spectralFlux * 10, // スケールの調整
                features.zeroCrossingRate * 1000, // スケールの調整
                features.bandEnergies.lowBand * 10,
                features.bandEnergies.midBand * 10,
                features.bandEnergies.highBand * 10
            ];
            
            return {
                time,
                vector
            };
        });
    }
    
    /**
     * 特性ベクトルをクラスタリングして話者を分離
     * @private
     * @param {Array} featureVectors 
     * @param {number} k クラスタ数（最大話者数）
     * @returns {Promise<Array>} クラスタ情報
     */
    async clusterFeatureVectors(featureVectors, k) {
        return new Promise((resolve) => {
            // 実際の話者数を特定（無音部分を除外）
            const activeVectors = featureVectors.filter(v => 
                v.vector[1] > 0.1  // RMS値が閾値より大きい場合のみ
            );
            
            if (activeVectors.length === 0) {
                resolve([]);
                return;
            }
            
            // k-meansクラスタリングの実装
            const kMeans = this.kMeansClustering(
                activeVectors.map(v => v.vector),
                Math.min(k, activeVectors.length)
            );
            
            // 各特性ベクトルにクラスタラベルを割り当て
            const labeledVectors = featureVectors.map(v => {
                // RMS値が小さい場合は無音とみなす
                if (v.vector[1] <= 0.1) {
                    return {
                        time: v.time,
                        vector: v.vector,
                        cluster: -1  // -1は無音を示す
                    };
                }
                
                // 最も近いクラスタを見つける
                const distances = kMeans.centroids.map(centroid => 
                    this.euclideanDistance(v.vector, centroid)
                );
                
                const minIndex = distances.indexOf(Math.min(...distances));
                
                return {
                    time: v.time,
                    vector: v.vector,
                    cluster: minIndex
                };
            });
            
            resolve(labeledVectors);
        });
    }
    
    /**
     * k-meansクラスタリングを実行
     * @private
     * @param {Array} vectors ベクトルの配列
     * @param {number} k クラスタ数
     * @param {number} maxIterations 最大繰り返し回数
     * @returns {Object} クラスタリング結果
     */
    kMeansClustering(vectors, k, maxIterations = 100) {
        if (vectors.length === 0) {
            return { centroids: [], assignments: [] };
        }
        
        // 初期セントロイドをランダムに選択
        const centroids = Array(k).fill().map(() => {
            const randomIndex = Math.floor(Math.random() * vectors.length);
            return [...vectors[randomIndex]];
        });
        
        let assignments = Array(vectors.length).fill(-1);
        let iterations = 0;
        let changed = true;
        
        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;
            
            // ステップ1: 各ベクトルを最も近いセントロイドに割り当て
            for (let i = 0; i < vectors.length; i++) {
                const vector = vectors[i];
                let minDistance = Infinity;
                let closestCentroid = 0;
                
                for (let j = 0; j < k; j++) {
                    const distance = this.euclideanDistance(vector, centroids[j]);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestCentroid = j;
                    }
                }
                
                if (assignments[i] !== closestCentroid) {
                    assignments[i] = closestCentroid;
                    changed = true;
                }
            }
            
            // ステップ2: セントロイドを再計算
            const newCentroids = Array(k).fill().map(() => Array(vectors[0].length).fill(0));
            const counts = Array(k).fill(0);
            
            for (let i = 0; i < vectors.length; i++) {
                const cluster = assignments[i];
                counts[cluster]++;
                
                for (let j = 0; j < vectors[i].length; j++) {
                    newCentroids[cluster][j] += vectors[i][j];
                }
            }
            
            for (let i = 0; i < k; i++) {
                if (counts[i] > 0) {
                    for (let j = 0; j < newCentroids[i].length; j++) {
                        newCentroids[i][j] /= counts[i];
                    }
                    centroids[i] = newCentroids[i];
                }
            }
        }
        
        return { centroids, assignments };
    }
    
    /**
     * 二つのベクトル間のユークリッド距離を計算
     * @private
     * @param {Array} vec1 
     * @param {Array} vec2 
     * @returns {number} 距離
     */
    euclideanDistance(vec1, vec2) {
        return Math.sqrt(
            vec1.reduce((sum, value, i) => sum + Math.pow(value - vec2[i], 2), 0)
        );
    }
    
    /**
     * 文字起こしセグメントに話者を割り当て
     * @private
     * @param {Array} clusteredFeatures クラスタリングされた特性ベクトル
     * @param {Array} featureVectors 元の特性ベクトル
     * @param {Array} transcriptionChunks 文字起こしチャンク
     * @returns {Array} 話者が割り当てられたセグメントの配列
     */
    assignSpeakersToSegments(clusteredFeatures, featureVectors, transcriptionChunks) {
        const result = [];
        
        for (const chunk of transcriptionChunks) {
            const [startTime, endTime] = chunk.timestamp;
            
            // このチャンクの時間範囲に含まれる特性ベクトルを抽出
            const relevantFeatures = clusteredFeatures.filter(
                f => f.time >= startTime && f.time <= endTime
            );
            
            // 無音でないクラスタのみをカウント
            const clusterCounts = relevantFeatures.reduce((counts, feature) => {
                if (feature.cluster >= 0) {
                    counts[feature.cluster] = (counts[feature.cluster] || 0) + 1;
                }
                return counts;
            }, {});
            
            // 最も多く出現したクラスタを話者として割り当て
            let dominantCluster = -1;
            let maxCount = 0;
            
            Object.entries(clusterCounts).forEach(([cluster, count]) => {
                if (count > maxCount) {
                    maxCount = count;
                    dominantCluster = parseInt(cluster);
                }
            });
            
            // 話者ラベルを割り当て（アルファベットに変換）
            const speakerLabel = dominantCluster >= 0 
                ? String.fromCharCode(65 + dominantCluster % 26) // A, B, C, ...
                : 'Unknown';
            
            result.push({
                text: chunk.text,
                start: startTime,
                end: endTime,
                speaker: speakerLabel
            });
        }
        
        return result;
    }
    
    /**
     * セグメントを最適化（短いセグメントのマージなど）
     * @private
     * @param {Array} segments 
     * @returns {Array} 最適化されたセグメント
     */
    optimizeSegments(segments) {
        if (segments.length <= 1) {
            return segments;
        }
        
        const result = [segments[0]];
        
        // 連続する同一話者のセグメントをマージ
        for (let i = 1; i < segments.length; i++) {
            const currentSegment = segments[i];
            const previousSegment = result[result.length - 1];
            
            // 同じ話者で時間的に近い場合はマージ
            if (
                currentSegment.speaker === previousSegment.speaker &&
                currentSegment.start - previousSegment.end <= this.mergeThreshold
            ) {
                previousSegment.end = currentSegment.end;
                previousSegment.text += ' ' + currentSegment.text;
            } else {
                result.push(currentSegment);
            }
        }
        
        return result;
    }
    
    /**
     * セグメントから一意の話者リストを抽出
     * @private
     * @param {Array} segments 
     * @returns {Array} 一意の話者リスト
     */
    extractUniqueSpeakers(segments) {
        const uniqueSpeakers = new Set();
        segments.forEach(segment => {
            if (segment.speaker !== 'Unknown') {
                uniqueSpeakers.add(segment.speaker);
            }
        });
        
        return Array.from(uniqueSpeakers).sort();
    }
    
    /**
     * 進捗を更新してコールバックを呼び出す
     * @private
     * @param {number} progress 0-1の進捗値
     * @param {string} message 進捗メッセージ
     */
    updateProgress(progress, message) {
        if (this.onProcessingProgress) {
            this.onProcessingProgress({
                progress: Math.min(1, Math.max(0, progress)),
                message
            });
        }
    }
    
    /**
     * 処理中かどうかを確認
     * @returns {boolean}
     */
    isCurrentlyProcessing() {
        return this.isProcessing;
    }
}
