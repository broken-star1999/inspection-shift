import Phaser from 'phaser';

const roomKey = 'shift-room';
const sprites = ['luo', 'tang', 'xu', 'chen', 'zhou', 'sun'];
const evening = new Set(['summary', 'handoff', 'ending']);
const logicalHeight = 220;
// Inside the moving frame, distant layers counter some of the foreground displacement.
const roomTravel = { x: 4, y: 2.7 };
const workerTravel = { x: 2, y: 1.35 };

const warmLight = `
  precision mediump float;
  uniform sampler2D uMainSampler;
  uniform float uTime;
  uniform float uDay;
  uniform float uClose;
  uniform vec2 uLook;
  varying vec2 outTexCoord;

  void main () {
    vec2 uv = outTexCoord;
    vec4 source = texture2D(uMainSampler, uv);
    vec2 center = (uv - vec2(0.44, 0.53)) * vec2(1.0, 0.76);
    float edge = smoothstep(0.25, 0.69, length(center));
    vec2 look = vec2(uLook.x, -uLook.y);
    vec2 lamp = (uv - vec2(0.70, 0.80) - look * vec2(0.064, 0.044)) * vec2(1.17, 0.69);
    float glow = exp(-8.0 * dot(lamp, lamp));
    vec2 glass = uv - vec2(0.60, 0.53) - look * vec2(0.108, 0.064);
    float slant = (glass.x + glass.y * 0.29) * 6.6;
    float reflection = exp(-slant * slant - 11.0 * glass.y * glass.y);
    float pulse = (0.97 + 0.025 * sin(uTime * 1.3) + 0.005 * sin(uTime * 3.9));
    float film = fract(dot(mod(floor(gl_FragCoord.xy), 4.0), vec2(0.25, 0.625))) - 0.5;
    vec3 color = source.rgb * mix(vec3(1.0), vec3(0.94, 0.96, 1.04), uDay);
    color *= 1.0 - edge * 0.28 - uClose * 0.14;
    color += glow * pulse * (1.0 - uClose * 0.38) * vec3(0.091, 0.048, 0.015);
    color += reflection * (1.0 - uClose * 0.5) * vec3(0.014, 0.029, 0.028);
    color += film * 0.012;
    gl_FragColor = vec4(color, source.a);
  }
`;

class WarmLightPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, renderTarget: 1, fragShader: warmLight });
    this.daylight = 0;
    this.closed = 0;
    this.elapsed = 0;
    this.lookX = 0;
    this.lookY = 0;
  }

  onDraw(target) {
    this.set1f('uTime', this.elapsed);
    this.set1f('uDay', this.daylight);
    this.set1f('uClose', this.closed);
    this.set2f('uLook', this.lookX, this.lookY);
    this.bindAndDraw(target);
    if (this.ready) return;
    const program = this.currentShader?.program?.webGLProgram;
    if (program && this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      this.ready = true;
      this.game.canvas.parentElement.dataset.shader = 'warm-light';
    }
  }
}

function drawRoom(ctx) {
  const rect = (color, x, y, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  rect('#263230', 0, 0, 480, 165);
  rect('#182422', 0, 0, 480, 24);
  rect('#34413a', 0, 24, 480, 3);
  rect('#35433d', 0, 103, 480, 24);
  rect('#485149', 0, 101, 480, 3);
  rect('#2c3935', 0, 126, 480, 39);
  rect('#45574e', 122, 29, 245, 83);
  rect('#172924', 128, 33, 232, 79);
  rect('#263b34', 134, 38, 220, 72);
  rect('#3b5044', 156, 44, 176, 64);
  rect('#32483d', 169, 54, 151, 55);
  rect('#283e34', 173, 57, 144, 49);
  rect('#738171', 224, 61, 43, 45);
  rect('#45534a', 228, 64, 35, 42);
  rect('#9a9d7c', 233, 69, 23, 13);
  rect('#b5ae78', 233, 69, 23, 3);
  rect('#393d31', 252, 90, 3, 6);
  for (let x = 132; x <= 350; x += 28) {
    rect('#36483f', x, 36, 2, 67);
  }
  for (let y = 55; y < 102; y += 14) {
    rect('rgba(33,47,41,0.34)', 135, y, 217, 1);
  }
  for (const x of [38, 86, 389, 434]) {
    rect('#273631', x, 29, 4, 100);
    rect('#536152', x + 4, 29, 2, 102);
    rect('#232e2a', x - 4, 124, 13, 6);
  }
  for (const x of [74, 385]) {
    rect('#111d1a', x, 11, 28, 7);
    rect('#bdb080', x + 2, 16, 24, 3);
    for (let step = 0; step < 13; step++) {
      rect('rgba(207,176,110,0.023)', x - step * 2, 19 + step * 4, 28 + step * 4, 4);
    }
  }
  rect('#657567', 0, 128, 480, 2);
  rect('#5d6757', 0, 140, 480, 4);
  rect('#28362f', 0, 144, 480, 3);
  for (let y = 148; y < 165; y += 5) {
    rect('#323f36', 0, y, 480, 1);
  }
  rect('#23322a', 18, 78, 36, 37);
  rect('#586a56', 21, 83, 29, 2);
  rect('#29332a', 383, 83, 29, 24);
  rect('#90694c', 392, 89, 15, 3);
  for (let i = 0; i < 180; i++) {
    const x = (i * 113 + 509) % 480;
    const y = (i * 53 + 471) % 143;
    rect(i % 3 === 0 ? 'rgba(251,220,159,0.10)' : 'rgba(9,16,13,0.14)', x, y, i % 4 ? 2 : 4, 1);
  }
}

const fallbackUniforms = {
  luo: ['#526e69', '#8caa92', '#372a26', '#cf9c6c'],
  tang: ['#56674c', '#a6ac72', '#2c2b27', '#d4a172'],
  xu: ['#514c49', '#938a77', '#666761', '#ab755a'],
  chen: ['#8d9281', '#d2ccaf', '#3c302b', '#d29976'],
  zhou: ['#474d57', '#82898a', '#34332b', '#b98263'],
  sun: ['#6a584e', '#a49379', '#4e392e', '#c48c68'],
};

function drawWorker(ctx, who) {
  const [jacket, seam, hair, skin] = fallbackUniforms[who];
  const rect = (color, x, y, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  rect('#172320', 16, 75, 56, 35);
  rect('#172320', 9, 88, 70, 22);
  rect(jacket, 17, 77, 54, 33);
  rect(jacket, 11, 89, 66, 21);
  rect(seam, 19, 79, 16, 3);
  rect(seam, 53, 79, 16, 3);
  rect('#1b2722', 42, 92, 4, 18);
  rect(seam, 49, 94, 12, 7);
  rect('#30443a', 50, 96, 9, 3);
  rect(hair, 24, 22, 39, 34);
  rect(hair, 28, 17, 31, 9);
  rect('#1a211c', 24, 43, 41, 22);
  rect('#172320', 31, 68, 26, 13);
  rect(skin, 35, 60, 18, 20);
  rect(skin, 28, 34, 33, 26);
  rect(skin, 31, 58, 28, 11);
  rect(skin, 27, 44, 40, 12);
  rect('#e0ad7b', 31, 36, 4, 22);
  rect('#96634d', 55, 51, 6, 14);
  rect('#a16a52', 38, 62, 12, 4);
  rect('#322923', 34, 44, 6, 3);
  rect('#322923', 49, 44, 6, 3);
  rect('#f0bf8b', 42, 46, 5, 8);
  rect(hair, 25, 30, 31, who === 'tang' ? 11 : 7);
  rect(hair, 24, 36, 5, 12);
  rect(hair, 56, 29, 10, 12);
  if (who === 'chen' || who === 'sun') {
    rect('#292c26', 31, 43, 29, 2);
    rect('#292c26', 32, 49, 9, 2);
    rect('#292c26', 48, 49, 11, 2);
  }
  if (who === 'luo' || who === 'zhou') {
    rect(jacket, 22, 22, 46, 10);
    rect(seam, 26, 19, 34, 4);
    rect('#292d27', 20, 32, 46, 3);
  }
  if (who === 'xu') rect('#6f6757', 36, 57, 17, 3);
  rect(seam, 19, 82, 7, 3);
  rect('#1e2a23', 73, 92, 4, 18);
}

export function mountScenery(host, { baseUrl = import.meta.env.BASE_URL } = {}) {
  const view = host.ownerDocument.defaultView;
  const art = `${baseUrl.replace(/\/?$/, '/')}art/`;
  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)');
  let requested = { npc: null, day: 0, phase: 'title' };
  const viewPose = { x: 0, y: 0 };
  let activeScene;
  let observer;
  let destroyed = false;
  let game;

  function stageWidth() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    return width && height
      ? Phaser.Math.Clamp(Math.round(logicalHeight * width / height), 300, 1760)
      : 640;
  }

  class RoomScene extends Phaser.Scene {
    preload() {
      this.load.image(roomKey, `${art}room.webp`);
      sprites.forEach(key => this.load.image(`worker-${key}`, `${art}${key}.webp`));
    }

    create() {
      if (destroyed) return;
      activeScene = this;
      const hasRoomArt = this.textures.exists(roomKey);
      host.dataset.roomArt = hasRoomArt ? 'image' : 'fallback';
      if (!hasRoomArt) {
        const texture = this.textures.createCanvas(roomKey, 480, 165);
        drawRoom(texture.getContext());
        texture.refresh();
      }
      this.room = this.add.image(0, 0, roomKey);
      this.roomShade = this.add.rectangle(0, 0, 1, 1, 0x152a33, 0).setOrigin(0);
      this.worker = this.add.image(0, 0, '__WHITE').setOrigin(0.5, 1).setVisible(false);
      this.arrival = { progress: 1 };
      this.grade = 0;
      this.closing = 0;
      this.elapsed = 0;
      this.look = { x: 0, y: 0 };
      this.frame = {};
      this.isWebGL = this.game.renderer.type === Phaser.WEBGL;
      if (this.isWebGL) {
        const camera = this.cameras.main;
        this.game.renderer.pipelines.addPostPipeline('ShiftWarmLight', WarmLightPipeline);
        camera.setPostPipeline('ShiftWarmLight');
        this.pipeline = camera.getPostPipeline('ShiftWarmLight');
      }
      host.dataset.renderer = this.isWebGL ? 'webgl' : 'canvas';
      this.game.canvas.setAttribute('aria-hidden', 'true');
      Object.assign(this.game.canvas.style, {
        display: 'block',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        imageRendering: 'pixelated',
      });
      this.layout();
      this.show(requested);
      host.dataset.sceneReady = 'true';
      if (view.ResizeObserver) {
        observer = new view.ResizeObserver(() => this.layout());
        observer.observe(host);
      }
      view.addEventListener('resize', resize);
    }

    layout() {
      const width = stageWidth();
      if (this.scale.width !== width || this.scale.height !== logicalHeight) {
        this.scale.resize(width, logicalHeight);
        this.game.canvas.style.width = '100%';
        this.game.canvas.style.height = '100%';
      }
      const room = this.room.texture.getSourceImage();
      const scale = Math.max((width + 2 * (roomTravel.x + 1)) / room.width,
        (logicalHeight + 2 * (roomTravel.y + 1)) / room.height);
      this.room.setScale(scale);
      this.roomShade.setSize(width, logicalHeight).setDisplaySize(width, logicalHeight);
      this.workerX = width * 0.5;
      this.workerY = logicalHeight + 6;
      this.placeRoom();
      this.placeWorker();
    }

    placeRoom() {
      this.room.setPosition(
        Math.round(this.workerX + this.look.x * roomTravel.x),
        Math.round(logicalHeight * 0.5 + this.look.y * roomTravel.y),
      );
    }

    placeWorker() {
      if (!this.worker.visible) return;
      const stageProgress = this.arrival.progress;
      const slide = this.frame.phase === 'waiting' ? 37 : -21;
      const breath = reducedMotion.matches ? 0 : Math.sin(this.elapsed * 1.9) * 0.85;
      this.worker.setPosition(
        Math.round(this.workerX + (1 - stageProgress) * slide + this.look.x * workerTravel.x),
        Math.round(this.workerY + (1 - stageProgress) * 5 + breath + this.look.y * workerTravel.y),
      );
      this.worker.setAlpha(stageProgress);
    }

    show(next) {
      const previous = this.frame;
      const enters = next.npc !== previous.npc || (next.phase === 'case' && previous.phase === 'receipt');
      this.frame = next;
      if (next.phase === 'waiting') {
        if (previous.phase === 'waiting') return;
        this.tweens.killTweensOf(this.arrival);
        if (this.worker.visible && !reducedMotion.matches) {
          this.tweens.add({ targets: this.arrival, progress: 0, duration: 280, ease: 'Quad.In',
            onComplete: () => {
              this.worker.setVisible(false);
              delete host.dataset.npcArt;
            },
          });
          return;
        }
      }
      if (!sprites.includes(next.npc)) {
        this.worker.setVisible(false);
        delete host.dataset.npcArt;
      } else if (enters || !this.worker.visible) {
        const key = `worker-${next.npc}`;
        if (!this.textures.exists(key)) {
          const texture = this.textures.createCanvas(key, 88, 110);
          drawWorker(texture.getContext(), next.npc);
          texture.refresh();
        }
        this.worker.setTexture(key).setVisible(true);
        const texture = this.worker.texture.getSourceImage();
        host.dataset.npcArt = texture instanceof view.HTMLCanvasElement ? 'fallback' : 'image';
        const height = logicalHeight * 0.91;
        this.worker.setScale(Math.min(height / texture.height, 204 / texture.width));
        this.tweens.killTweensOf(this.arrival);
        this.arrival.progress = reducedMotion.matches ? 1 : 0;
        if (this.arrival.progress === 0) {
          this.tweens.add({ targets: this.arrival, progress: 1, duration: 420, ease: 'Cubic.Out' });
        }
      }
      this.placeWorker();
    }

    update(time, delta) {
      this.elapsed = (time / 1000) % 90;
      const still = reducedMotion.matches;
      const amount = still ? 1 : Math.min(1, delta / 345);
      this.look.x = still ? 0 : viewPose.x;
      this.look.y = still ? 0 : viewPose.y;
      this.grade = Phaser.Math.Linear(this.grade, Phaser.Math.Clamp(this.frame.day / 4, 0, 1), amount);
      this.closing = Phaser.Math.Linear(this.closing, evening.has(this.frame.phase) ? 1 : 0, amount);
      if (this.pipeline) {
        this.pipeline.elapsed = still ? 0 : this.elapsed;
        this.pipeline.daylight = this.grade;
        this.pipeline.closed = this.closing;
        this.pipeline.lookX = this.look.x;
        this.pipeline.lookY = this.look.y;
      } else {
        this.roomShade.setAlpha(this.closing * 0.22 + this.grade * 0.07);
      }
      this.placeRoom();
      this.placeWorker();
    }
  }

  function resize() {
    activeScene?.layout();
  }

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width: stageWidth(),
    height: logicalHeight,
    scale: { mode: Phaser.Scale.NONE },
    backgroundColor: '#263230',
    scene: RoomScene,
    pixelArt: true,
    antialias: false,
    input: { mouse: false, touch: false, keyboard: false, gamepad: false },
    audio: { noAudio: true },
    fps: { target: 40, min: 15 },
    banner: false,
  });

  return {
    setFrame(frame) {
      if (destroyed) return;
      requested = { ...requested, ...frame };
      activeScene?.show(requested);
    },
    setViewPose(x, y) {
      if (destroyed) return;
      viewPose.x = Number.isFinite(x) ? Phaser.Math.Clamp(x, -1, 1) : 0;
      viewPose.y = Number.isFinite(y) ? Phaser.Math.Clamp(y, -1, 1) : 0;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      view.removeEventListener('resize', resize);
      game.destroy(true);
      activeScene = undefined;
      delete host.dataset.sceneReady;
      delete host.dataset.renderer;
      delete host.dataset.shader;
      delete host.dataset.roomArt;
      delete host.dataset.npcArt;
    },
  };
}
