/**
 * エクスポートモジュール
 * - 文字起こし結果を様々な形式でエクスポート
 */
class TranscriptExporter {
    /**
     * 文字起こし結果をCSV形式でエクスポート
     * @param {Array} segments 文字起こしセグメント
     * @param {Object} options オプション
     * @returns {string} CSV形式のテキスト
     */
    exportToCSV(segments, options = {}) {
        // デフォルトオプション
        const defaultOptions = {
            includeTimestamps: true,
            delimiter: ',',
            speakerNames: {} // 話者名のカスタマイズ、例: {A: '田中', B: '佐藤'}
        };
        
        const opts = { ...defaultOptions, ...options };
        
        // ヘッダー行
        let csvContent = opts.includeTimestamps
            ? `話者${opts.delimiter}開始時間${opts.delimiter}終了時間${opts.delimiter}内容\n`
            : `話者${opts.delimiter}内容\n`;
        
        // データ行
        segments.forEach(segment => {
            const speakerName = opts.speakerNames[segment.speaker] || `発話者${segment.speaker}`;
            
            if (opts.includeTimestamps) {
                const startTime = this.formatTime(segment.start);
                const endTime = this.formatTime(segment.end);
                csvContent += `${speakerName}${opts.delimiter}${startTime}${opts.delimiter}${endTime}${opts.delimiter}${segment.text}\n`;
            } else {
                csvContent += `${speakerName}${opts.delimiter}${segment.text}\n`;
            }
        });
        
        return csvContent;
    }
    
    /**
     * 文字起こし結果をMarkdown形式でエクスポート
     * @param {Array} segments 文字起こしセグメント
     * @param {Object} options オプション
     * @returns {string} Markdown形式のテキスト
     */
    exportToMarkdown(segments, options = {}) {
        // デフォルトオプション
        const defaultOptions = {
            includeTimestamps: true,
            includeHeader: true,
            speakerNames: {} // 話者名のカスタマイズ
        };
        
        const opts = { ...defaultOptions, ...options };
        
        let mdContent = '';
        
        // ヘッダーを追加
        if (opts.includeHeader) {
            mdContent += '# 文字起こし結果\n\n';
            
            // 現在の日時
            const now = new Date();
            mdContent += `生成日時: ${now.toLocaleString()}\n\n`;
        }
        
        // セグメントごとに処理
        segments.forEach(segment => {
            const speakerName = opts.speakerNames[segment.speaker] || `発話者${segment.speaker}`;
            
            // 話者名と時間を表示
            if (opts.includeTimestamps) {
                const timeRange = `${this.formatTime(segment.start)} - ${this.formatTime(segment.end)}`;
                mdContent += `### ${speakerName} (${timeRange})\n\n`;
            } else {
                mdContent += `### ${speakerName}\n\n`;
            }
            
            // 発言内容
            mdContent += `${segment.text}\n\n`;
        });
        
        return mdContent;
    }
    
    /**
     * 文字起こし結果をプレーンテキスト形式でエクスポート
     * @param {Array} segments 文字起こしセグメント
     * @param {Object} options オプション
     * @returns {string} プレーンテキスト
     */
    exportToText(segments, options = {}) {
        // デフォルトオプション
        const defaultOptions = {
            includeTimestamps: true,
            speakerNames: {} // 話者名のカスタマイズ
        };
        
        const opts = { ...defaultOptions, ...options };
        
        let textContent = '';
        
        // セグメントごとに処理
        segments.forEach(segment => {
            const speakerName = opts.speakerNames[segment.speaker] || `発話者${segment.speaker}`;
            
            // 話者名と時間を表示
            if (opts.includeTimestamps) {
                const timeRange = `${this.formatTime(segment.start)}-${this.formatTime(segment.end)}`;
                textContent += `[${speakerName} ${timeRange}] `;
            } else {
                textContent += `[${speakerName}] `;
            }
            
            // 発言内容
            textContent += `${segment.text}\n`;
        });
        
        return textContent;
    }
    
    /**
     * 秒数を時間表記（HH:MM:SS）に変換
     * @param {number} seconds 
     * @returns {string} フォーマットされた時間
     */
    formatTime(seconds) {
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
     * 文字起こし結果をファイルとしてダウンロード
     * @param {string} content ファイルの内容
     * @param {string} filename ファイル名
     * @param {string} type ファイルタイプ
     */
    downloadFile(content, filename, type = 'text/plain') {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
    }
}
