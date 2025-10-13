import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';

addEventListener('message', async () => {
  try {
    tf.getBackend();
    const model = await cocoSsd.load();
    postMessage({ status: 'loaded' });
  } catch (error) {
    postMessage({ status: 'error', error: String(error) });
  }
});
