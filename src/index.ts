import ffmpeg from "fluent-ffmpeg";
import { writeFile } from "fs";

const WIDTH = 86;
const HEIGHT = 64;

const command = ffmpeg("./data/video.mp4")
  .inputFPS(30)

  // Convert video to black and white using threshold src:https://ffmpeg.org/ffmpeg-filters.html#threshold
  // The s=wxh is equal to the original dimension of the video
  .addInput("color=gray:s=480x360")
  .inputFormat("lavfi")

  .addInput("color=black:s=480x360")
  .inputFormat("lavfi")

  .addInput("color=white:s=480x360")
  .inputFormat("lavfi")

  .addOutputOption("-lavfi threshold")

  // convert video to show rgb values
  .addOutputOption("-f rawvideo")
  .addOutputOption("-pix_fmt rgb24")

  // resize to WIDTH and HEIGHT
  .addOutputOption(`-s ${WIDTH}x${HEIGHT}`)

  .on("start", (commandLine) => {
    console.log("Spawned Ffmpeg with command: " + commandLine);
  })
  .on("end", () => {
    console.log("Converting Finised!");
  })
  .on("error", (e, _stdout, stderr) => {
    console.error(e.message);
    console.error(stderr);
  });

const bwStream = command.pipe();

// Set the size of each frame and multiply it by 3 since we have rgb values
let frameSize = WIDTH * HEIGHT * 3;
// allocate memory for the bufffer with 1MB padding
const buffer = Buffer.alloc(frameSize + 1024 * 1024);
let buffPos = 0;
const frames: number[][][] = [];

// process buffer, HUGE HELP FROM: https://stackoverflow.com/a/76474153
// The idea is that the chunk received might not be enough for a frame / contains data for the next frame
// so we need to take account of that
bwStream.on("data", (chunk) => {
  // copy chunk to buffer at a given position
  chunk.copy(buffer, buffPos);

  // increment the buffPos with the length of the chunk
  buffPos += chunk.length;

  // if the buffer is enough for a single frame
  if (buffPos >= frameSize) {
    // get only the pixels with the size of the frame (remember that buffer has padding)
    const rawPixels = buffer.subarray(0, frameSize);

    // convert the RGB24 buffer to matrix of pixels
    const frame = bufferToPixelMatrix(rawPixels);
    frames.push(frame);

    // move the rest of unused buffer to the front of the buffer
    buffer.copy(buffer, 0, frameSize, buffPos - frameSize);
    buffPos = buffPos - frameSize;
  }
});

bwStream.on("end", () => {
  // write to JSON
  const framesJSON = JSON.stringify(frames);
  writeFile("./data/data.json", framesJSON, (err) => {
    if (err) {
      console.error(`Error writing to file: ${err}`);
    }

    console.log("Finished converting to JSON");
  });
});

/**
 * Slice and converts RGB24 buffer to array of pixels with size of WIDTH x HEIGHT
 * @param buffer RGB24 buffer
 * @returns {number[][]} array of pixels of a single frame
 */

function bufferToPixelMatrix(buffer: Buffer): number[][] {
  const frame = new Array<number[]>(new Array<number>(HEIGHT));

  for (let i = 0; i < HEIGHT; i++) {
    const lineBuffer = buffer.subarray(i * WIDTH, i * WIDTH + WIDTH - 1);
    const pixels = getAvgPixels(lineBuffer);
    frame[i] = pixels;
  }

  return frame;
}
/**
 * Convert the average pixel values of each pixel in a given RGB24 buffer
 * @param buffer RGB24 buffer
 * @returns {number[]} array of average pixel of each pixels
 */
function getAvgPixels(buffer: Buffer): number[] {
  const WINDOW_SIZE = 3;
  const pixelsSize = Math.floor(buffer.length / 3);
  const avgPixels = new Array<number>(pixelsSize);

  for (let i = 0; i < pixelsSize; i++) {
    const offset = i * WINDOW_SIZE;
    const avgPixelValue = Math.floor(
      (buffer[offset] + buffer[offset + 1] + buffer[offset + 2]) / WINDOW_SIZE
    );
    avgPixels[i] = avgPixelValue < 125 ? 0 : 1;
  }

  return avgPixels;
}
