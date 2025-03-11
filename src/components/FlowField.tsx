import React, { useEffect, useRef, useState } from 'react';

// PureCanvas Component
class PureCanvas extends React.Component<{
    width: number;
    height: number;
    contextRef: (ctx: CanvasRenderingContext2D) => void;
}> {
    shouldComponentUpdate() {
        return false;
    }

    render() {
        const { width, height, contextRef } = this.props;
        return (
            <canvas
                width={width}
                height={height}
                className="w-full h-full object-contain"
                style={{ imageRendering: 'pixelated' }}
                ref={node => {
                    if (node) {
                        const ctx = node.getContext('2d');
                        if (ctx) contextRef(ctx);
                    }
                }}
            />
        );
    }
}

interface FlowFieldProps {
    imageSrc: string;
    width?: number;
    height?: number;
}

interface FlowFieldCell {
    x: number;
    y: number;
    red: number;
    green: number;
    blue: number;
    alpha: number;
    colorAngle: number;
    magnitude: number;
}

interface IEffect {
    width: number;
    height: number;
    cellSize: number;
    cols: number;
    flowField: FlowFieldCell[];
    debug: boolean;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    particles: Particle[];
    render: () => void;
    init: () => void;
}

class Particle {
    effect: Effect;
    x: number;
    y: number;
    speedX: number;
    speedY: number;
    speedModifier: string;
    history: Array<{x: number, y: number}>;
    maxLength: number;
    angle: number;
    newAngle: number;
    angleCorrector: number;
    timer: number;
    red: number;
    green: number;
    blue: number;
    alpha: number;
    lineWidth: number;
    color: string;
    _isWhite: boolean;
    _lastColorUpdate: number;
    _lastAngle: number;
    isDead: boolean;

    constructor(effect: Effect){
        this.effect = effect;
        this.x = Math.floor(Math.random() * this.effect.width);
        this.y = Math.floor(Math.random() * this.effect.height);
        this.speedX = 0;
        this.speedY = 0;
        this.speedModifier = (Math.random() * 0.75 + 0.25).toFixed(2);
        this.history = [{x: this.x, y: this.y}];
        this.maxLength = Math.floor(Math.random() * 30 + 20);
        this.angle = 0;
        this.newAngle = 0;
        this.angleCorrector = Math.random() * 0.05 + 0.02;
        this.timer = this.maxLength * 2;
        this.red = 255;
        this.green = Math.random() * 10;
        this.blue = Math.random() * 10;
        this.alpha = Math.random() * 0.3 + 0.5;
        this.lineWidth = Math.random() * 1 + 0.5;
        this.color = `rgba(${this.red}, ${this.green}, ${this.blue}, ${this.alpha})`;
        if (Math.random() > 0.85){
            this.maxLength = Math.floor(Math.random() * 40 + 30);
            this.lineWidth = 1;
            this.color = 'rgba(255, 255, 255, 0.25)';
        }
        this._isWhite = this.color.includes('255, 255, 255');
        this._lastColorUpdate = this.timer;
        this._lastAngle = this.angle;
        this.isDead = false;
    }

    draw(context: CanvasRenderingContext2D){
        context.save();
        context.beginPath();
        context.moveTo(this.history[0].x, this.history[0].y);
        for (let i = 0; i < this.history.length; i++){
            context.lineTo(this.history[i].x, this.history[i].y);
        }
        context.shadowBlur = 20;
        context.shadowColor = 'rgba(255, 0, 0, 0.9)';
        context.strokeStyle = this.color;
        context.lineWidth = this.lineWidth;
        context.stroke();
        context.restore();
    }

    update(){
        if (this.timer < 1) {
            if (this.history.length > 1) {
                this.history.shift();
                return;
            }
            this.isDead = true;
            return;
        }

        this.timer--;
        const x = Math.floor(this.x / this.effect.cellSize);
        const y = Math.floor(this.y / this.effect.cellSize);
        const index = y * this.effect.cols + x;

        const flowFieldIndex = this.effect.flowField[index];
        if (!flowFieldIndex || flowFieldIndex.alpha < 100) {
            this.isDead = true;
            return;
        }

        const isWhite = flowFieldIndex.red > 200 && flowFieldIndex.green > 200 && flowFieldIndex.blue > 200;
        
        // Cache calculations
        if (isWhite && !this._isWhite) {
            this._isWhite = true;
            this.angleCorrector = 0.25;
            this.maxLength = Math.floor(Math.random() * 40 + 30);
            this.alpha = 0.2;
            this.lineWidth = Math.random() * 0.8 + 0.3;
        } else if (!isWhite && this._isWhite) {
            this._isWhite = false;
            this.angleCorrector = 0.015;
            this.maxLength = Math.floor(Math.random() * 20 + 10);
            this.alpha = 0.6;
        }

        this.newAngle = flowFieldIndex.colorAngle;
        if (this.angle !== this.newAngle) {
            this.angle += (this.newAngle - this.angle) * this.angleCorrector;
        }

        // Update color only when needed
        if (this._lastColorUpdate !== this.timer) {
            this._lastColorUpdate = this.timer;
            this.red = 255;
            this.green = isWhite ? 255 : Math.min(flowFieldIndex.magnitude * 0.1, 10);
            this.blue = isWhite ? 255 : Math.min(flowFieldIndex.magnitude * 0.1, 10);
            this.color = `rgba(${this.red}, ${this.green}, ${this.blue}, ${this.alpha})`;
        }

        // Cache speed calculations
        if (this._lastAngle !== this.angle) {
            this._lastAngle = this.angle;
            this.speedX = Math.cos(this.angle);
            this.speedY = Math.sin(this.angle);
        }

        this.x += this.speedX * Number(this.speedModifier);
        this.y += this.speedY * Number(this.speedModifier);

        this.history.push({x: this.x, y: this.y});
        if (this.history.length > this.maxLength) {
            this.history.shift();
        }
    }

    reset(){
        this.isDead = false;
        let attempts = 0;
        let resetSuccess = false;

        while (attempts < 50 && !resetSuccess){
            attempts++
            const testIndex = Math.floor(Math.random() * this.effect.flowField.length);
            if (this.effect.flowField[testIndex].alpha > 200){
                this.x = this.effect.flowField[testIndex].x;
                this.y = this.effect.flowField[testIndex].y;
                this.history = [{x: this.x, y: this.y}];
                this.timer = this.maxLength * 2;
                resetSuccess = true;
            }
        }
        if (!resetSuccess){
            this.x = Math.random() * this.effect.width;
            this.y = Math.random() * this.effect.height;
            this.history = [{x: this.x, y: this.y}];
            this.timer = this.maxLength * 2;
        }
        this._isWhite = this.color.includes('255, 255, 255');
        this._lastColorUpdate = this.timer;
        this._lastAngle = this.angle;
    }
}

class Effect implements IEffect {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    width: number;
    height: number;
    particles: Particle[];
    numberOfParticles: number;
    cellSize: number;
    rows: number;
    cols: number;
    flowField: FlowFieldCell[];
    debug: boolean;
    image: HTMLImageElement;
    curve: number;
    zoom: number;
    particlePool: Particle[];
    activeParticles: Set<Particle>;
    inactiveParticles: Set<Particle>;
    validSpawnPoints: number[];

    constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, image: HTMLImageElement){
        this.canvas = canvas;
        this.context = ctx;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.particles = [];
        this.numberOfParticles = 1000;
        this.cellSize = 2;
        this.rows = 0;
        this.cols = 0;
        this.flowField = [];
        this.debug = false;
        this.image = image;
        this.curve = 6.28;
        this.zoom = 0.3;
        this.particlePool = [];
        this.activeParticles = new Set();
        this.inactiveParticles = new Set();
        this.validSpawnPoints = [];
        this.init();
    }

    drawFlowFieldImage(){
        const imageWidth = this.image.width * 6;
        const imageHeight = this.image.height * 6;
        this.context.drawImage(
            this.image, 
            this.width * 0.5 - imageWidth * 0.5, 
            this.height * 0.5 - imageHeight * 0.5, 
            imageWidth, 
            imageHeight
        );
    }

    init(){
        this.rows = Math.floor(this.height / this.cellSize);
        this.cols = Math.floor(this.width / this.cellSize);
        this.flowField = [];

        this.context.drawImage(this.image, 0, 0, this.width, this.height);
        const pixels = this.context.getImageData(0, 0, this.width, this.height).data;
        
        const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
        const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
        
        for (let y = 0; y < this.height; y += this.cellSize){
            for (let x = 0; x < this.width; x += this.cellSize){
                const index = (y * this.width + x) * 4;
                
                const isWhite = pixels[index] > 200 && pixels[index + 1] > 200 && pixels[index + 2] > 200;
                
                let edgeX = 0;
                let edgeY = 0;
                
                for(let i = -1; i <= 1; i++) {
                    for(let j = -1; j <= 1; j++) {
                        const pixelIndex = ((y + i) * this.width + (x + j)) * 4;
                        if(pixelIndex >= 0 && pixelIndex < pixels.length) {
                            const weight = sobelX[(i + 1) * 3 + (j + 1)];
                            edgeX += pixels[pixelIndex] * weight;
                            edgeY += pixels[pixelIndex] * sobelY[(i + 1) * 3 + (j + 1)];
                        }
                    }
                }
                
                const edgeMagnitude = Math.sqrt(edgeX * edgeX + edgeY * edgeY);
                let angle = Math.atan2(edgeY, edgeX);
                
                if(isWhite) {
                    angle = Math.atan2(edgeY, edgeX) + Math.PI/2;
                } else {
                    const centerX = this.width * 0.5;
                    const centerY = this.height * 0.5;
                    angle = Math.atan2(y - centerY, x - centerX);
                }
                
                this.flowField.push({
                    x: x,
                    y: y,
                    red: pixels[index],
                    green: pixels[index + 1],
                    blue: pixels[index + 2],
                    alpha: pixels[index + 3],
                    colorAngle: angle,
                    magnitude: isWhite ? 255 : edgeMagnitude
                });
            }
        }

        // Pre-calculate valid spawn points
        this.validSpawnPoints = this.flowField
            .map((cell, index) => cell.alpha > 200 ? index : -1)
            .filter(index => index !== -1);

        // Initialize particle pool
        this.particlePool = Array.from({ length: this.numberOfParticles * 1.2 }, 
            () => new Particle(this));
        
        // Initially activate numberOfParticles
        for (let i = 0; i < this.numberOfParticles; i++) {
            const particle = this.particlePool[i];
            this.resetParticle(particle);
            this.activeParticles.add(particle);
        }
        
        // Rest go to inactive pool
        for (let i = this.numberOfParticles; i < this.particlePool.length; i++) {
            this.inactiveParticles.add(this.particlePool[i]);
        }
    }

    resetParticle(particle: Particle) {
        // Fast path: Try a random valid spawn point first
        if (this.validSpawnPoints.length > 0) {
            const randomIndex = this.validSpawnPoints[Math.floor(Math.random() * this.validSpawnPoints.length)];
            const cell = this.flowField[randomIndex];
            particle.x = cell.x;
            particle.y = cell.y;
            particle.speedX = Math.cos(cell.colorAngle);
            particle.speedY = Math.sin(cell.colorAngle);
            particle.angle = cell.colorAngle;
            particle._lastAngle = cell.colorAngle;
        } else {
            // Fallback to random position if no valid spawn points
            particle.x = Math.random() * this.width;
            particle.y = Math.random() * this.height;
            const angle = Math.random() * Math.PI * 2;
            particle.speedX = Math.cos(angle);
            particle.speedY = Math.sin(angle);
            particle.angle = angle;
            particle._lastAngle = angle;
        }
        
        // Reset particle properties with slower speed
        particle.speedModifier = (Math.random() * 0.75 + 0.25).toFixed(2);
        particle.angleCorrector = Math.random() * 0.05 + 0.02;
        
        if (Math.random() > 0.85) {
            particle.maxLength = Math.floor(Math.random() * 40 + 30);
            particle.lineWidth = 1;
            particle.color = 'rgba(255, 255, 255, 0.25)';
            particle._isWhite = true;
            particle.angleCorrector = 0.25;
        } else {
            particle.maxLength = Math.floor(Math.random() * 20 + 10);
            particle.lineWidth = Math.random() * 0.8 + 0.3;
            particle.alpha = Math.random() * 0.3 + 0.5;
            particle.color = `rgba(255, ${Math.random() * 10}, ${Math.random() * 10}, ${particle.alpha})`;
            particle._isWhite = false;
            particle.angleCorrector = 0.015;
        }
        
        particle._lastColorUpdate = particle.timer;
    }

    drawGrid(){
        this.context.save();
        this.context.strokeStyle = 'rgba(255, 0, 0, 0.3)';
        this.context.lineWidth = 0.3;
        for (let c = 0; c < this.cols; c++){
            this.context.beginPath();
            this.context.moveTo(this.cellSize * c, 0);
            this.context.lineTo(this.cellSize * c, this.height);
            this.context.stroke();
        }
        for (let r = 0; r < this.rows; r++){
            this.context.beginPath();
            this.context.moveTo(0, this.cellSize * r);
            this.context.lineTo(this.width, this.cellSize * r);
            this.context.stroke();
        }
        this.context.restore();
    }

    render() {
        if (this.debug) {
            this.drawGrid();
            this.drawFlowFieldImage();
        }

        // Pre-allocate arrays for white and red particles
        const whiteParticles: Particle[] = [];
        const redParticles: Particle[] = [];
        const deadParticles: Particle[] = [];
        
        // Update particles and collect dead ones
        for (const particle of this.activeParticles) {
            particle.update();
            
            if (particle.isDead) {
                deadParticles.push(particle);
                continue;
            }
            
            // Skip particles with insufficient history
            if (particle.history.length < 2) continue;
            
            // Sort into appropriate array
            if (particle._isWhite) {
                whiteParticles.push(particle);
            } else {
                redParticles.push(particle);
            }
        }

        // Handle dead particles in batch
        if (deadParticles.length > 0) {
            for (const deadParticle of deadParticles) {
                this.activeParticles.delete(deadParticle);
                this.inactiveParticles.add(deadParticle);
            }

            // Reactivate particles in batch
            const inactiveArray = Array.from(this.inactiveParticles);
            const numToReactivate = Math.min(deadParticles.length, inactiveArray.length);
            
            for (let i = 0; i < numToReactivate; i++) {
                const particle = inactiveArray[i];
                this.inactiveParticles.delete(particle);
                this.resetParticle(particle);
                this.activeParticles.add(particle);
            }
        }

        // Batch render particles
        this.context.save();
        this.context.shadowBlur = 20;
        this.context.shadowColor = 'rgba(255, 0, 0, 0.9)';
        
        // Render white particles
        if (whiteParticles.length > 0) {
            this.context.beginPath();
            this.context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            this.context.lineWidth = 0.5;
            
            for (let i = 0; i < whiteParticles.length; i++) {
                const particle = whiteParticles[i];
                const history = particle.history;
                
                this.context.moveTo(history[0].x, history[0].y);
                for (let j = 1; j < history.length; j++) {
                    this.context.lineTo(history[j].x, history[j].y);
                }
            }
            
            this.context.stroke();
        }
        
        // Render red particles
        if (redParticles.length > 0) {
            this.context.beginPath();
            this.context.strokeStyle = 'rgba(255, 0, 0, 0.6)';
            this.context.lineWidth = 1;
            
            for (let i = 0; i < redParticles.length; i++) {
                const particle = redParticles[i];
                const history = particle.history;
                
                this.context.moveTo(history[0].x, history[0].y);
                for (let j = 1; j < history.length; j++) {
                    this.context.lineTo(history[j].x, history[j].y);
                }
            }
            
            this.context.stroke();
        }
        
        this.context.restore();
    }
}

const FlowField = ({ 
    imageSrc, 
    width = 1500, 
    height = 1500 
}: FlowFieldProps): React.ReactElement => {
    const imageRef = useRef<HTMLImageElement>(null);
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
    const effectRef = useRef<Effect | null>(null);
    const lastFrameTimeRef = useRef<number>(0);
    const FPS = 60;
    const frameInterval = 1000 / FPS;

    useEffect(() => {
        if (!ctx || !imageRef.current) return undefined;

        let animationFrameId: number;
        let isDestroyed = false;

        // canvas settings
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';

        const img = imageRef.current;
        
        const startEffect = () => {
            if (!ctx || !img || isDestroyed) return;
            effectRef.current = new Effect(ctx.canvas, ctx, img);
            animate();
        };

        const animate = (timestamp = 0) => {
            if (isDestroyed || !ctx || !effectRef.current) return;

            const deltaTime = timestamp - lastFrameTimeRef.current;
            if (deltaTime < frameInterval) {
                animationFrameId = requestAnimationFrame(animate);
                return;
            }

            ctx.clearRect(0, 0, width, height);
            effectRef.current.render();
            lastFrameTimeRef.current = timestamp - (deltaTime % frameInterval);
            animationFrameId = requestAnimationFrame(animate);
        };
        
        img.onload = startEffect;
        img.onerror = () => console.error('Error loading image');

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'd' && effectRef.current) {
                effectRef.current.debug = !effectRef.current.debug;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        
        return () => {
            isDestroyed = true;
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            window.removeEventListener('keydown', handleKeyDown);
            effectRef.current = null;
        };
    }, [ctx, width, height, frameInterval]);

    return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            <img
                ref={imageRef}
                id="avengersLogo"
                src={imageSrc}
                alt="Flow field source"
                className="hidden"
            />
            <PureCanvas
                width={width}
                height={height}
                contextRef={setCtx}
            />
        </div>
    );
};

export default FlowField; 