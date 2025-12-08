async function main() {
    console.log("Javascript is running...");

    if (!navigator.gpu) {
        throw new Error("WebGPU is not supported by your browser");
    }

    // Get a GPU

    const adapter = await navigator.gpu.requestAdapter({
        // which GPU to pick, if there is such choise
        // can be either low-power or high-performance
        // https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter
        powerPreference: "low-power"
    });

    if (!adapter) {
        throw new Error("Couldn't find a suitable adapter for WebGPU");
    }

    // get a GPU device
    // Here you can pass opitonal options to request a certain hardware features
    // or request for a higher limits
    const device = await adapter.requestDevice();
    if (!device) {
        throw new Error("Failed to request device from GPUAdapter");
    }

    // get a canvas we want to draw to
    const canvas = document.getElementById("canvas-main");

    // get a webgpu context from the canvas
    const context = canvas.getContext("webgpu");

    // associate the device and format with the context
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        // associalte this canvas with the device, so that draw calls that device recieves
        // are displayed on this canvas
        device: device,

        // texture format that the context should use (?)
        // tells how textures are layed out in memory
        // like the rgba8unorm or bgra8unorm
        format: canvasFormat
    });

    // make a packed float32 array
    const vertices = new Float32Array([
        0, 0, 0, // Triangle 1
        1, 0, 0,
        1, 1, 0,

        0, 0, 0, // Triangle 2
        1, 1, 0,
        0, 1, 0,
    ]);

    // create a buffer with the same size as the "vertices" array

    // the vertexBuffer is mostly an immutable object.
    // You cannot change it's type, size, etc
    // What you can do though is write data to it through device.queue.writeBuffer()
    const vertexBuffer = device.createBuffer({
        // label is used to identify webgpu resources
        // used in error messages
        // useful for debugging
        label: "Cell vertices",
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    // copy data to the buffer
    device.queue.writeBuffer (
        vertexBuffer, 
        0, // Buffer offset, we are writing at the start
        vertices,
    );

    // For GPU, the data we just wrote is just rubbish array of bytes
    // Therefore we'll use a vertex buffer layout
    const vertexBufferLayout = {
        arrayStride: 12, // size of a single vertex, in bytes
        attributes: [{
            format: "float32x3", // we are storing two 32 bit floats
            offset: 0, // offset of this attribute (position)
            shaderLocation: 0, // Position, see vertex shader
        }],
    };

    const cellShaderModule = device.createShaderModule({
    label: "Cell shader",
    code: `
        struct OurVertexShaderOutput {
            @builtin(position) position: vec4f,
            @location(0) fragColor: vec4f,
        };

        @vertex
        fn vertexMain (
            @location(0) pos: vec3f,
            @builtin(vertex_index) vertexIndex: u32
        ) -> OurVertexShaderOutput {
            var colors = array<vec4f, 6>(
                vec4f(1.0, 0.0, 0.0, 1.0),
                vec4f(0.0, 1.0, 0.0, 1.0),
                vec4f(0.0, 0.0, 1.0, 1.0),
                vec4f(1.0, 1.0, 0.0, 1.0),
                vec4f(0.0, 1.0, 1.0, 1.0),
                vec4f(1.0, 0.0, 1.0, 1.0)
            );

            return OurVertexShaderOutput (
                vec4f (pos, 1.0),
                colors[vertexIndex],
            );
        }
        
        // we bind attributes and pass between vertex and fragment shader by index (@location(0))
        @fragment
        fn fragmentMain (@location(0) color: vec4f) -> @location(0) vec4f {
            return color;
        }
    `
    });

    const cellPipeline = device.createRenderPipeline({
        label: "Cell pipeline",
        layout: "auto",
        vertex: {
            module: cellShaderModule,
            entryPoint: "vertexMain",
            buffers: [vertexBufferLayout]
        },
        fragment: {
            module: cellShaderModule,
            entryPoint: "fragmentMain",
            targets: [{
                format: canvasFormat
            }]
        }
    });

    // in webgpu we render things by sending commands to a queue,
    // which are then processed by the GPU
    const encoder = device.createCommandEncoder();

    // This render pass tells the canvas texture to clear with a
    // clearValue color, and then store it in the same location
    // resulting in texture being colored with clearValue color
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: { r: 0, g: 0, b: 0.3, a: 1 },
            storeOp: "store",
        }]
    });

    pass.setPipeline(cellPipeline);

    // zero corresponds to the first vertex buffer set in the pipeline
    // cellPipeline.vertex.buffers[0]
    pass.setVertexBuffer(0, vertexBuffer);

    pass.draw(6); // 6 vertices

    pass.end();

    const commandBuffer = encoder.finish();

    device.queue.submit([commandBuffer]);
}
main();