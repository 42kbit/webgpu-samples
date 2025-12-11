async function main() {
    if (!navigator.gpu) {
        throw new Error("WebGPU is not supported by your browser");
    }

    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: "low-power"
    });

    if (!adapter) {
        throw new Error("Couldn't find a suitable adapter for WebGPU");
    }

    const device = await adapter.requestDevice();
    if (!device) {
        throw new Error("Failed to request device from GPUAdapter");
    }

    const canvas = document.getElementById("canvas-main");

    const context = canvas.getContext("webgpu");

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat
    });

    const shaderModule = device.createShaderModule({
        label: 'main',
        code: /* wgsl */ `
            struct Vertex {
                pos: vec4f
            };

            // we require 16 byte alignment for storage buffer structs
            @group(0) @binding(0) var<storage, read> vertices: array<Vertex>;

            @vertex
            fn vs_main(
                @builtin(vertex_index) vertexIndex: u32
            ) -> @builtin(position) vec4f {
              // let vtx= array<vec3f, 6>(
              //       vec3f(0, 0, 0), // Triangle 1
              //       vec3f(1, 0, 0),
              //       vec3f(1, 1, 0),

              //       vec3f(0, 0, 0), // Triangle 2
              //       vec3f(1, 1, 0),
              //       vec3f(0, 1, 0),
              // );
              // return vec4f(vtx[vertexIndex], 1.0);
                            return vertices[vertexIndex].pos;
            }

            @fragment
            fn fs_main() -> @location(0) vec4f {
                return vec4f(1, 0, 0, 1);
            }
        `
    });

    // make a float32 array with 4 floats per vertex (x, y, z, w)
    // 16 byte alignment is required for storage buffer structs
    const vertexData = new Float32Array([
        0, 0, 0, 1, // Triangle 1
        1, 0, 0, 1,
        1, 1, 0, 1,

        0, 0, 0, 1, // Triangle 2
        1, 1, 0, 1,
        0, 1, 0, 1,
    ]);

    const storageVertexBuffer = device.createBuffer({
        size: vertexData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(
        storageVertexBuffer,
        0,
        vertexData,
    );

    const rendererPipeline = device.createRenderPipeline({
        label: "main",
        layout: "auto",
        vertex: {
            module: shaderModule,
            entryPoint: "vs_main",
        },
        fragment: {
            module: shaderModule,
            targets: [{ format: canvasFormat }],
            entryPoint: "fs_main",
        }
    });

    // Create the bind group using the same explicit layout. Note the buffer resource
    // must be passed as `{ buffer: storageVertexBuffer }`.
    const bindGroup = device.createBindGroup({
        label: 'main-bindgroup',
        layout: rendererPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: storageVertexBuffer } },
        ],
    });

    /** @type(GPURenderPassDescriptor) */
    const renderPassDescriptor = {
        label: 'main',
        colorAttachments: [
            {
                clearValue: [0.3, 0.3, 0.3, 1],
                loadOp: 'clear',
                storeOp: 'store',
                view: context.getCurrentTexture().createView(),
            }
        ]
    }

    const encoder = device.createCommandEncoder();

    const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(rendererPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6);
    pass.end();

    const commands = encoder.finish();
    device.queue.submit([commands]);
}
main();