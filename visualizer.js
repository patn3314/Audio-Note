/**
 * 音声可視化モジュール
 * - 録音中の音声を視覚的に表示
 */
class AudioVisualizer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.canvasCtx = this.canvas.getContext('2d');
        
        // キャンバスのリサイズ
        this.resizeCanvas();
        
        // 描画のプロパティ
        this.barWidth = 3;
        this.barSpacing = 1;
        this.barColor = '#4285f4';
        this.barGradient = null;
        
        // アニメーションフレーム参照
        this.animationFrameId = null;
        
        // イベントリスナー
        window.addEventListener('resize', this.resizeCanvas.bind(this));
        
        // テーマ切り替え用
        this.isDarkTheme = false;
    }
    
    /**
     * キャンバスをリサイズ
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        
        // グラデーションを再作成
        this.createGradient();
    }
    
    /**
     * グラデーションを作成
     */
    createGradient() {
        this.barGradient = this.canvasCtx.createLinearGradient(
            0, this.canvas.height, 0, 0
        );
        
        if (this.isDarkTheme) {
            this.barGradient.addColorStop(0, '#8ab4f8');
            this.barGradient.addColorStop(0.5, '#a78bfa');
            this.barGradient.addColorStop(1, '#ec4899');
        } else {
            this.barGradient.addColorStop(0, '#4285f4');
            this.barGradient.addColorStop(0.5, '#673ab7');
            this.barGradient.addColorStop(1, '#e91e63');
        }
    }
    
    /**
     * テーマを設定
     * @param {boolean} isDark ダークモードかどうか
     */
    setTheme(isDark) {
        this.isDarkTheme = isDark;
        this.createGradient();
    }
    
    /**
     * 可視化を開始
     * @param {Function} getDataCallback データを取得するコールバック関数
     */
    start(getDataCallback) {
        // 既存のアニメーションがあれば停止
        if (this.animationFrameId) {
            this.stop();
        }
        
        const animate = () => {
            // データを取得
            const dataArray = getDataCallback();
            
            // データがなければ空の描画
            if (!dataArray || dataArray.length === 0) {
                this.clearCanvas();
                this.animationFrameId = requestAnimationFrame(animate);
                return;
            }
            
            // キャンバスをクリア
            this.clearCanvas();
            
            // バーの描画
            const numBars = Math.floor(this.canvas.width / (this.barWidth + this.barSpacing));
            const dataStep = Math.floor(dataArray.length / numBars);
            
            this.canvasCtx.fillStyle = this.barGradient;
            
            for (let i = 0; i < numBars; i++) {
                const dataIndex = i * dataStep;
                const barHeight = (dataArray[dataIndex] / 255) * this.canvas.height;
                
                const x = i * (this.barWidth + this.barSpacing);
                const y = this.canvas.height - barHeight;
                
                this.canvasCtx.fillRect(x, y, this.barWidth, barHeight);
            }
            
            // 次のフレームを要求
            this.animationFrameId = requestAnimationFrame(animate);
        };
        
        // アニメーションを開始
        animate();
    }
    
    /**
     * 可視化を停止
     */
    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
            this.clearCanvas();
        }
    }
    
    /**
     * キャンバスをクリア
     */
    clearCanvas() {
        this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    /**
     * 静的なビジュアライゼーションを描画
     * @param {Uint8Array} dataArray 
     */
    drawStatic(dataArray) {
        this.clearCanvas();
        
        if (!dataArray || dataArray.length === 0) {
            return;
        }
        
        const numBars = Math.floor(this.canvas.width / (this.barWidth + this.barSpacing));
        const dataStep = Math.floor(dataArray.length / numBars);
        
        this.canvasCtx.fillStyle = this.barGradient;
        
        for (let i = 0; i < numBars; i++) {
            const dataIndex = i * dataStep;
            const barHeight = (dataArray[dataIndex] / 255) * this.canvas.height;
            
            const x = i * (this.barWidth + this.barSpacing);
            const y = this.canvas.height - barHeight;
            
            this.canvasCtx.fillRect(x, y, this.barWidth, barHeight);
        }
    }
}
