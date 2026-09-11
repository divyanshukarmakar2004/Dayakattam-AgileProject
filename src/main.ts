import { Scene3D } from './three/scene';
import { UIController } from './ui/controller';
import './style.css';

window.addEventListener('DOMContentLoaded', () => {
  const scene = new Scene3D();
  scene.init(document.getElementById('app')!);

  const ui = new UIController(scene);
  ui.wire();
  
});
