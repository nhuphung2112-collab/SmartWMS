
/*
 * SmartWMS - Shared Data Engine
 * Browser demo using localStorage.
 * Compatible with existing SmartWMS pages.
 */

const WmsDemo = (() => {
    "use strict";

    const directory =
        typeof location === "undefined"
            ? "/test/"
            : new URL(".", location.href).pathname;

    // Keep the original key so existing data remains available.
    const key = "smartwms:v2:" + directory;

    const defaults = {
        receiving: { workers: 2, perHour: 40 },
        putaway: { workers: 2, perHour: 50 },
        picking: { workers: 2, perHour: 30 },
        packing: { workers: 2, perHour: 25 },
        shipping: { workers: 2, perHour: 60 }
    };

    const stages = {
        receiving: [
            "receipts", "receipt_id", "receipt_code", "RCV"
        ],
        putaway: [
            "putaways", "putaway_id", "putaway_code", "PUT"
        ],
        picking: [
            "pickings", "picking_id", "picking_code", "PCK"
        ],
        packing: [
            "packings", "packing_id", "packing_code", "PKG"
        ],
        shipping: [
            "shipping_orders",
            "shipping_order_id",
            "shipping_code",
            "SHP"
        ]
    };

    const stageNames = {
        receiving: "Nhận hàng",
        putaway: "Cất hàng",
        picking: "Lấy hàng",
        packing: "Đóng gói",
        shipping: "Xuất hàng"
    };

    const products = [
        {
            product_id: 1,
            sku: "SKU-001",
            product_name: "Thùng hàng A",
            unit: "thùng"
        },
        {
            product_id: 2,
            sku: "SKU-002",
            product_name: "Thùng hàng B",
            unit: "thùng"
        }
    ];

    const suppliers = [
        {
            supplier_id: 1,
            supplier_name: "Nhà cung cấp mô phỏng"
        }
    ];

    const employees = [
        {
            employee_id: 1,
            employee_name: "Nhân viên kho"
        }
    ];

    const locations = [
        {
            location_id: 1,
            location_code: "DOCK-01"
        },
        {
            location_id: 2,
            location_code: "STO-A01"
        },
        {
            location_id: 3,
            location_code: "STO-A02"
        }
    ];

    const orders = Array.from(
        { length: 30 },
        (_, index) => {
            const order_id = index + 1;

            return {
                order_id,
                order_code:
                    "SO-" + String(order_id).padStart(3, "0"),
                priority: "Thường",
                order_date:
                    new Date().toLocaleDateString("vi-VN"),
                required_date:
                    new Date(
                        Date.now() + 86400000
                    ).toLocaleDateString("vi-VN"),
                line_count: 1,
                total_qty: 4 + order_id % 5,
                product_id: order_id % 2 ? 1 : 2
            };
        }
    );

    function clone(value) {
        return structuredClone(value);
    }

    function num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function amount(value, positive = false) {
        const n = Number(value);

        if (
            !Number.isSafeInteger(n) ||
            n < (positive ? 1 : 0)
        ) {
            throw new Error(
                "Số lượng thùng phải là số nguyên hợp lệ."
            );
        }

        return n;
    }

    function find(rows, field, id) {
        const row = rows.find(
            item => Number(item[field]) === Number(id)
        );

        if (!row) {
            throw new Error(
                "Không tìm thấy dữ liệu phù hợp."
            );
        }

        return row;
    }

    function freshState() {
        return {
            orders: clone(orders),
            capacity: clone(defaults),
            nextId: 100,
            receipts: [],
            batches: [],
            putaways: [],
            pickings: [],
            packings: [],
            packages: [],
            shipments: [],
            shipping_orders: []
        };
    }

    function normalizeState(state) {
        for (const [collection] of Object.values(stages)) {
            if (!Array.isArray(state[collection])) {
                state[collection] = [];
            }
        }

        for (const name of [
            "orders",
            "batches",
            "packages",
            "shipments"
        ]) {
            if (!Array.isArray(state[name])) {
                state[name] = [];
            }
        }

        if (!state.capacity) {
            state.capacity = clone(defaults);
        }

        for (const stage of Object.keys(stages)) {
            if (!state.capacity[stage]) {
                state.capacity[stage] =
                    clone(defaults[stage]);
            }
        }

        if (!Number.isSafeInteger(state.nextId)) {
            state.nextId = 100;
        }

        return state;
    }

    function read() {
        const raw = localStorage.getItem(key);

        if (raw) {
            try {
                const saved = JSON.parse(raw);

                if (
                    saved &&
                    typeof saved === "object" &&
                    Object.values(stages).some(
                        ([collection]) =>
                            Array.isArray(saved[collection])
                    )
                ) {
                    return normalizeState(saved);
                }
            } catch (error) {
                console.error(
                    "Dữ liệu SmartWMS không hợp lệ:",
                    error
                );
                throw new Error(
                    "Không đọc được dữ liệu kho đã lưu. " +
                    "Hãy xuất bản sao dữ liệu trước khi đặt lại."
                );
            }
        }

        const state = freshState();
        seed(state);

        localStorage.setItem(
            key,
            JSON.stringify(state)
        );

        return state;
    }

    function save(state) {
        localStorage.setItem(
            key,
            JSON.stringify(state)
        );

        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new Event("wms:change")
            );
        }
    }

    async function locked(action) {
        if (
            typeof navigator !== "undefined" &&
            navigator.locks
        ) {
            return navigator.locks.request(
                key,
                action
            );
        }

        return action();
    }

    function get(stage, state) {
        const common = {
            products,
            suppliers,
            employees,
            locations
        };

        switch (stage) {
            case "receiving":
                return {
                    ...common,
                    receipts: state.receipts
                };

            case "putaway":
                return {
                    ...common,
                    tasks: state.putaways,
                    batches: state.batches.filter(
                        b => num(b.available_qty) > 0
                    )
                };

            case "picking":
                return {
                    ...common,
                    tasks: state.pickings,
                    orders: state.orders.filter(
                        order => !state.pickings.some(
                            p =>
                                Number(p.order_id) ===
                                Number(order.order_id)
                        )
                    )
                };

            case "packing":
                return {
                    ...common,
                    tasks: state.packings,
                    packages: state.packages,
                    details: state.packages.flatMap(
                        p => (p.items || []).map(
                            item => ({
                                ...item,
                                ...p
                            })
                        )
                    ),
                    available_picking:
                        state.pickings.filter(
                            p =>
                                p.status === "COMPLETED" &&
                                !state.packings.some(
                                    t =>
                                        Number(t.order_id) ===
                                        Number(p.order_id)
                                )
                        )
                };

            case "shipping":
                return {
                    ...common,
                    shipping_orders:
                        state.shipping_orders,
                    shipments: state.shipments,
                    packages: state.packages.filter(
                        p => p.status === "SHIPPED"
                    )
                };

            default:
                throw new Error(
                    "Công đoạn không hợp lệ."
                );
        }
    }

    function execute(stage, payload, workingState) {
        if (!stages[stage]) {
            throw new Error(
                "Công đoạn không hợp lệ."
            );
        }

        const state = workingState || clone(read());

        if (!payload) {
            return {
                data: get(stage, state)
            };
        }

        const [
            collection,
            idKey,
            codeKey,
            prefix
        ] = stages[stage];

        const rows = state[collection];

        const {
            action,
            ...data
        } = clone(payload);

        for (const field of [
            "employee_id",
            "supplier_id",
            "order_id",
            "picking_id",
            "batch_id",
            "destination_location_id"
        ]) {
            if (field in data) {
                data[field] = Number(data[field]);
            }
        }

        const nextId = () => state.nextId++;

        if (action === "details") {
            return {
                data: find(
                    rows,
                    idKey,
                    data[idKey]
                ).items
            };
        }

        if (action === "create") {
            const employee = find(
                employees,
                "employee_id",
                data.employee_id
            );

            const id = nextId();

            const row = {
                ...data,
                [idKey]: id,
                [codeKey]: prefix + "-" + id,
                employee_name:
                    employee.employee_name,
                status: "PENDING"
            };

            if (stage === "receiving") {
                row.supplier_name = find(
                    suppliers,
                    "supplier_id",
                    data.supplier_id
                ).supplier_name;

                if (
                    !Array.isArray(data.items) ||
                    !data.items.length
                ) {
                    throw new Error(
                        "Phiếu nhận cần ít nhất một sản phẩm."
                    );
                }

                row.items = data.items.map(item => {
                    const product = find(
                        products,
                        "product_id",
                        item.product_id
                    );

                    return {
                        ...item,
                        ...product,
                        expected_qty: amount(
                            item.expected_qty,
                            true
                        ),
                        receiving_item_id: nextId()
                    };
                });
            }

            if (stage === "putaway") {
                const batch = find(
                    state.batches,
                    "batch_id",
                    data.batch_id
                );

                const quantity = amount(
                    data.quantity,
                    true
                );

                if (
                    quantity >
                    num(batch.available_qty)
                ) {
                    throw new Error(
                        "Số lượng vượt quá lô hàng khả dụng."
                    );
                }

                const destination = find(
                    locations,
                    "location_id",
                    data.destination_location_id
                );

                if (
                    !destination.location_code.startsWith(
                        "STO"
                    )
                ) {
                    throw new Error(
                        "Hãy chọn vị trí lưu trữ STO."
                    );
                }

                batch.available_qty -= quantity;

                Object.assign(row, {
                    quantity,
                    product_name:
                        batch.product_name,
                    batch_code:
                        batch.batch_code,
                    destination_location:
                        destination.location_code
                });
            }

            if (stage === "picking") {
                const order = find(
                    get(stage, state).orders,
                    "order_id",
                    data.order_id
                );

                let remaining = amount(
                    order.total_qty,
                    true
                );

                const allocations = [];

                for (const stock of state.putaways) {
                    if (
                        stock.status !== "COMPLETED" ||
                        num(stock.stock_qty) <= 0 ||
                        remaining <= 0
                    ) {
                        continue;
                    }

                    const batch = find(
                        state.batches,
                        "batch_id",
                        stock.batch_id
                    );

                    if (
                        Number(batch.product_id) !==
                        Number(order.product_id)
                    ) {
                        continue;
                    }

                    const quantity = Math.min(
                        remaining,
                        num(stock.stock_qty)
                    );

                    allocations.push({
                        stock,
                        batch,
                        quantity
                    });

                    remaining -= quantity;
                }

                if (remaining > 0) {
                    throw new Error(
                        "Tồn kho khả dụng chưa đủ. " +
                        "Đơn cần " +
                        order.total_qty +
                        " thùng, còn thiếu " +
                        remaining +
                        " thùng đúng SKU."
                    );
                }

                row.items = allocations.map(
                    allocation => {
                        allocation.stock.stock_qty -=
                            allocation.quantity;

                        return {
                            ...find(
                                products,
                                "product_id",
                                allocation.batch.product_id
                            ),
                            picking_detail_id: nextId(),
                            batch_code:
                                allocation.batch.batch_code,
                            location_code:
                                allocation.stock.destination_location,
                            requested_qty:
                                allocation.quantity,
                            picked_qty: 0
                        };
                    }
                );

                Object.assign(row, {
                    order_id: order.order_id,
                    order_code: order.order_code,
                    detail_count: row.items.length,
                    requested_total:
                        order.total_qty,
                    picked_total: 0
                });
            }

            if (stage === "packing") {
                const picking = find(
                    get(stage, state).available_picking,
                    "picking_id",
                    data.picking_id
                );

                Object.assign(row, {
                    order_id: picking.order_id,
                    order_code: picking.order_code,
                    package_count: 0,
                    packed_qty: 0
                });
            }

            if (stage === "shipping") {
                const packing = find(
                    state.packings.filter(
                        p => p.status === "COMPLETED"
                    ),
                    "order_id",
                    data.order_id
                );

                if (
                    rows.some(
                        r =>
                            Number(r.order_id) ===
                            Number(packing.order_id)
                    )
                ) {
                    throw new Error(
                        "Đơn hàng đã có phiếu xuất."
                    );
                }

                Object.assign(row, {
                    order_id: packing.order_id,
                    order_code: packing.order_code,
                    created_time:
                        new Date().toLocaleString("vi-VN"),
                    package_count: 0
                });
            }

            rows.push(row);

        } else if (
            action === "update_delivery" &&
            stage === "shipping"
        ) {
            const shipment = find(
                state.shipments,
                "shipment_id",
                data.shipment_id
            );

            if (
                !["DELIVERED", "FAILED"].includes(
                    data.delivery_status
                )
            ) {
                throw new Error(
                    "Trạng thái giao hàng không hợp lệ."
                );
            }

            if (
                shipment.delivery_status === "DELIVERED" &&
                data.delivery_status !== "DELIVERED"
            ) {
                throw new Error(
                    "Chuyến đã giao thành công."
                );
            }

            shipment.delivery_status =
                data.delivery_status;

        } else {
            const row = find(
                rows,
                idKey,
                data[idKey]
            );

            if (
                action === "start" &&
                row.status === "PENDING"
            ) {
                row.status = "IN_PROGRESS";

                if (!workingState) {
                    row.started_at =
                        new Date().toISOString();
                }

            } else if (
                action === "complete" &&
                row.status === "IN_PROGRESS" &&
                stage !== "shipping"
            ) {
                if (stage === "receiving") {
                    if (
                        !Array.isArray(data.items) ||
                        data.items.length !== row.items.length
                    ) {
                        throw new Error(
                            "Cần kiểm tra đầy đủ các dòng hàng."
                        );
                    }

                    const validated = row.items.map(
                        item => {
                            const input = find(
                                data.items,
                                "receiving_item_id",
                                item.receiving_item_id
                            );

                            const received_qty =
                                amount(input.received_qty);

                            const accepted_qty =
                                amount(input.accepted_qty);

                            const rejected_qty =
                                amount(input.rejected_qty);

                            if (
                                accepted_qty + rejected_qty !==
                                received_qty
                            ) {
                                throw new Error(
                                    "Số đạt và số loại phải bằng số thực nhận."
                                );
                            }

                            if (
                                received_qty >
                                num(item.expected_qty)
                            ) {
                                throw new Error(
                                    "Số thực nhận vượt số lượng dự kiến."
                                );
                            }

                            if (
                                input.qc_result === "FAIL" &&
                                accepted_qty > 0
                            ) {
                                throw new Error(
                                    "Hàng QC không đạt không thể nhập tồn."
                                );
                            }

                            return {
                                item,
                                received_qty,
                                accepted_qty,
                                rejected_qty,
                                qc_result:
                                    input.qc_result,
                                qc_note:
                                    input.qc_note || ""
                            };
                        }
                    );

                    for (const result of validated) {
                        Object.assign(
                            result.item,
                            {
                                received_qty:
                                    result.received_qty,
                                accepted_qty:
                                    result.accepted_qty,
                                rejected_qty:
                                    result.rejected_qty,
                                qc_result:
                                    result.qc_result,
                                qc_note:
                                    result.qc_note
                            }
                        );

                        if (result.accepted_qty > 0) {
                            const id = nextId();

                            state.batches.push({
                                ...result.item,
                                batch_id: id,
                                batch_code: "LOT-" + id,
                                available_qty:
                                    result.accepted_qty
                            });
                        }
                    }
                }

                if (stage === "putaway") {
                    row.stock_qty =
                        amount(row.quantity, true);
                }

                if (stage === "picking") {
                    if (
                        !Array.isArray(data.picked_items)
                    ) {
                        throw new Error(
                            "Thiếu danh sách hàng đã lấy."
                        );
                    }

                    for (const item of row.items) {
                        const picked = find(
                            data.picked_items,
                            "detail_id",
                            item.picking_detail_id
                        );

                        if (
                            amount(picked.picked_qty) !==
                            amount(item.requested_qty)
                        ) {
                            throw new Error(
                                "Cần lấy đủ số lượng yêu cầu."
                            );
                        }

                        item.picked_qty =
                            amount(picked.picked_qty);
                    }

                    row.picked_total =
                        row.requested_total;
                }

                if (stage === "packing") {
                    const picking = find(
                        state.pickings,
                        "picking_id",
                        row.picking_id
                    );

                    if (
                        !Array.isArray(data.packages) ||
                        !data.packages.length
                    ) {
                        throw new Error(
                            "Cần tạo ít nhất một kiện hàng."
                        );
                    }

                    const allItems =
                        data.packages.flatMap(
                            p => p.items || []
                        );

                    for (const picked of picking.items) {
                        const packed = allItems
                            .filter(
                                i =>
                                    Number(i.picking_detail_id) ===
                                    Number(picked.picking_detail_id)
                            )
                            .reduce(
                                (total, item) =>
                                    total +
                                    amount(
                                        item.packed_qty,
                                        true
                                    ),
                                0
                            );

                        if (
                            packed !==
                            num(picked.picked_qty)
                        ) {
                            throw new Error(
                                "Cần đóng đủ số lượng đã lấy."
                            );
                        }
                    }

                    for (const pkg of data.packages) {
                        if (
                            !Array.isArray(pkg.items) ||
                            !pkg.items.length
                        ) {
                            throw new Error(
                                "Kiện phải có sản phẩm."
                            );
                        }

                        const id = nextId();

                        const items = pkg.items.map(
                            item => ({
                                ...find(
                                    picking.items,
                                    "picking_detail_id",
                                    item.picking_detail_id
                                ),
                                packed_qty: amount(
                                    item.packed_qty,
                                    true
                                ),
                                condition_status:
                                    item.condition_status ||
                                    "GOOD"
                            })
                        );

                        state.packages.push({
                            ...pkg,
                            items,
                            packaging_unit_id: id,
                            package_code: "BOX-" + id,
                            packing_id: row.packing_id,
                            packing_code: row.packing_code,
                            status: "PACKED"
                        });

                        row.packed_qty +=
                            items.reduce(
                                (total, item) =>
                                    total +
                                    item.packed_qty,
                                0
                            );

                        row.package_count++;
                    }
                }

                row.status = "COMPLETED";

                if (
                    !workingState &&
                    row.started_at
                ) {
                    row.completed_at =
                        new Date().toISOString();

                    row.actual_minutes =
                        (
                            Date.parse(row.completed_at) -
                            Date.parse(row.started_at)
                        ) / 60000;
                }

            } else if (
                action === "create_shipment" &&
                stage === "shipping" &&
                row.status === "IN_PROGRESS"
            ) {
                const packing = find(
                    state.packings,
                    "order_id",
                    row.order_id
                );

                const available =
                    state.packages.filter(
                        p =>
                            Number(p.packing_id) ===
                            Number(packing.packing_id) &&
                            p.status === "PACKED"
                    );

                if (
                    !Array.isArray(data.package_ids) ||
                    !data.package_ids.length
                ) {
                    throw new Error(
                        "Hãy chọn kiện hàng."
                    );
                }

                const ids = [
                    ...new Set(
                        data.package_ids.map(Number)
                    )
                ];

                const packages = ids.map(
                    id => find(
                        available,
                        "packaging_unit_id",
                        id
                    )
                );

                packages.forEach(
                    pkg => {
                        pkg.status = "SHIPPED";
                    }
                );

                const id = nextId();

                state.shipments.push({
                    ...data,
                    shipping_order_id:
                        row.shipping_order_id,
                    package_ids: ids,
                    shipment_id: id,
                    shipment_code: "TRIP-" + id,
                    shipping_code: row.shipping_code,
                    order_id: row.order_id,
                    order_code: row.order_code,
                    delivery_status: "PENDING"
                });

                row.package_count +=
                    packages.length;

                if (
                    available.every(
                        pkg =>
                            pkg.status === "SHIPPED"
                    )
                ) {
                    row.status = "SHIPPED";
                }

            } else {
                throw new Error(
                    "Thao tác không phù hợp với trạng thái hiện tại."
                );
            }
        }

        if (!workingState) {
            save(state);
        }

        return {
            success: true,
            message: "Đã lưu dữ liệu mô phỏng."
        };
    }

    async function request(stage, payload) {
        if (!stages[stage]) {
            throw new Error(
                "Công đoạn không hợp lệ."
            );
        }

        if (!payload) {
            return execute(stage);
        }

        return locked(
            () => execute(stage, payload)
        );
    }

    function seed(state) {
        const run = (stage, action, data) =>
            execute(
                stage,
                {
                    action,
                    employee_id: 1,
                    ...data
                },
                state
            );

        const create = (stage, data) => {
            run(stage, "create", data);

            return state[
                stages[stage][0]
            ].at(-1);
        };

        const start = (stage, row) =>
            run(stage, "start", row);

        for (let i = 0; i < 14; i++) {
            const arrival = new Date();

            arrival.setHours(
                8,
                i * 15,
                0,
                0
            );

            const receipt = create(
                "receiving",
                {
                    supplier_id: 1,
                    dock_number: "DOCK-01",
                    arrival_time:
                        arrival.toLocaleString("vi-VN"),
                    items: [
                        {
                            product_id: 1,
                            expected_qty: 20 + i
                        },
                        {
                            product_id: 2,
                            expected_qty: 18 + i
                        }
                    ]
                }
            );

            if (i >= 6) continue;

            start("receiving", receipt);

            run("receiving", "complete", {
                receipt_id: receipt.receipt_id,
                items: receipt.items.map(
                    item => ({
                        receiving_item_id:
                            item.receiving_item_id,
                        received_qty:
                            item.expected_qty,
                        accepted_qty:
                            item.expected_qty,
                        rejected_qty: 0,
                        qc_result: "PASS"
                    })
                )
            });
        }

        for (
            const [index, batch]
            of [...state.batches].entries()
        ) {
            const task = create(
                "putaway",
                {
                    batch_id: batch.batch_id,
                    quantity: batch.available_qty,
                    destination_location_id:
                        batch.product_id + 1
                }
            );

            if (index >= 10) continue;

            start("putaway", task);

            run("putaway", "complete", {
                putaway_id: task.putaway_id
            });
        }

        for (
            let order_id = 1;
            order_id <= 22;
            order_id++
        ) {
            const picking = create(
                "picking",
                { order_id }
            );

            start("picking", picking);

            if (order_id > 20) continue;

            run("picking", "complete", {
                picking_id: picking.picking_id,
                picked_items: picking.items.map(
                    item => ({
                        detail_id:
                            item.picking_detail_id,
                        picked_qty:
                            item.requested_qty
                    })
                )
            });

            const packing = create(
                "packing",
                {
                    picking_id:
                        picking.picking_id
                }
            );

            if (order_id > 18) continue;

            start("packing", packing);

            run("packing", "complete", {
                packing_id: packing.packing_id,
                packages: [
                    {
                        package_type: "Thùng carton",
                        weight: 5,
                        items: picking.items.map(
                            item => ({
                                picking_detail_id:
                                    item.picking_detail_id,
                                packed_qty:
                                    item.picked_qty
                            })
                        )
                    }
                ]
            });

            if (order_id > 12) continue;

            const shipping = create(
                "shipping",
                { order_id }
            );

            if (order_id > 10) continue;

            start("shipping", shipping);

            run(
                "shipping",
                "create_shipment",
                {
                    shipping_order_id:
                        shipping.shipping_order_id,
                    carrier_name:
                        "Vận tải demo",
                    vehicle_number:
                        "51C-12345",
                    package_ids: [
                        state.packages.at(-1)
                            .packaging_unit_id
                    ]
                }
            );

            run(
                "shipping",
                "update_delivery",
                {
                    shipment_id:
                        state.shipments.at(-1)
                            .shipment_id,
                    delivery_status:
                        "DELIVERED"
                }
            );
        }
    }

    function parseCsv(text) {
        const lines = String(text || "")
            .replace(/^\uFEFF/, "")
            .trim()
            .split(/\r?\n/);

        const delimiter =
            (lines[0] || "").includes(";")
                ? ";"
                : ",";

        const split = line =>
            line.split(delimiter).map(
                value => value.trim()
            );

        const header = split(
            lines[0] || ""
        ).map(
            value => value.toLowerCase()
        );

        if (
            header.length !== 2 ||
            header[0] !== "sku" ||
            header[1] !== "quantity"
        ) {
            throw new Error(
                "CSV phải có hai cột: sku,quantity."
            );
        }

        const items = [];

        for (
            let i = 1;
            i < lines.length;
            i++
        ) {
            if (!lines[i].trim()) continue;

            const cells = split(lines[i]);

            const product = products.find(
                p =>
                    p.sku ===
                    String(cells[0]).toUpperCase()
            );

            const qty = Number(cells[1]);

            if (
                cells.length !== 2 ||
                !product ||
                !Number.isSafeInteger(qty) ||
                qty <= 0
            ) {
                throw new Error(
                    "Dữ liệu không hợp lệ tại dòng " +
                    (i + 1)
                );
            }

            items.push({
                product_id: product.product_id,
                qty
            });
        }

        if (!items.length) {
            throw new Error(
                "CSV chưa có dữ liệu."
            );
        }

        if (items.length > 100) {
            throw new Error(
                "Mỗi lần chỉ nhập tối đa 100 dòng."
            );
        }

        return items;
    }

    async function importReceivingCsv(text) {
        const items = parseCsv(text);

        const quantities = new Map();

        for (const item of items) {
            const total =
                (quantities.get(item.product_id) || 0) +
                item.qty;

            amount(total, true);

            quantities.set(
                item.product_id,
                total
            );
        }

        return request("receiving", {
            action: "create",
            supplier_id: 1,
            employee_id: 1,
            dock_number: "DOCK-01",
            note: "Nhập từ CSV",
            items: [...quantities].map(
                ([product_id, expected_qty]) => ({
                    product_id,
                    expected_qty
                })
            )
        });
    }

    async function importStageScenario(
        stage,
        csvText
    ) {
        if (!stages[stage]) {
            throw new Error(
                "Công đoạn không hợp lệ."
            );
        }

        const items = parseCsv(csvText);

        return locked(() => {
            const state = clone(read());

            const run = (
                step,
                action,
                data = {}
            ) => execute(
                step,
                {
                    action,
                    employee_id: 1,
                    ...data
                },
                state
            );

            const create = (
                step,
                data
            ) => {
                run(
                    step,
                    "create",
                    data
                );

                return state[
                    stages[step][0]
                ].at(-1);
            };

            const start = (
                step,
                row
            ) => run(
                step,
                "start",
                row
            );

            for (const item of items) {
                const receipt = create(
                    "receiving",
                    {
                        supplier_id: 1,
                        dock_number:
                            "DOCK-01",
                        arrival_time:
                            new Date()
                                .toLocaleString("vi-VN"),
                        note:
                            "Kịch bản cộng dồn",
                        items: [
                            {
                                product_id:
                                    item.product_id,
                                expected_qty:
                                    item.qty
                            }
                        ]
                    }
                );

                if (
                    stage === "receiving"
                ) {
                    continue;
                }

                start(
                    "receiving",
                    receipt
                );

                run(
                    "receiving",
                    "complete",
                    {
                        receipt_id:
                            receipt.receipt_id,
                        items:
                            receipt.items.map(
                                x => ({
                                    receiving_item_id:
                                        x.receiving_item_id,
                                    received_qty:
                                        x.expected_qty,
                                    accepted_qty:
                                        x.expected_qty,
                                    rejected_qty: 0,
                                    qc_result:
                                        "PASS"
                                })
                            )
                    }
                );

                const batch =
                    state.batches.at(-1);

                const putaway = create(
                    "putaway",
                    {
                        batch_id:
                            batch.batch_id,
                        quantity:
                            item.qty,
                        destination_location_id:
                            item.product_id + 1
                    }
                );

                if (
                    stage === "putaway"
                ) {
                    continue;
                }

                start(
                    "putaway",
                    putaway
                );

                run(
                    "putaway",
                    "complete",
                    {
                        putaway_id:
                            putaway.putaway_id
                    }
                );

                const orderId =
                    state.nextId++;

                state.orders.push({
                    order_id: orderId,
                    order_code:
                        "SO-SIM-" + orderId,
                    priority: "Thường",
                    order_date:
                        new Date()
                            .toLocaleDateString("vi-VN"),
                    required_date:
                        new Date()
                            .toLocaleDateString("vi-VN"),
                    line_count: 1,
                    total_qty:
                        item.qty,
                    product_id:
                        item.product_id
                });

                const picking = create(
                    "picking",
                    {
                        order_id:
                            orderId
                    }
                );

                if (
                    stage === "picking"
                ) {
                    continue;
                }

                start(
                    "picking",
                    picking
                );

                run(
                    "picking",
                    "complete",
                    {
                        picking_id:
                            picking.picking_id,
                        picked_items:
                            picking.items.map(
                                detail => ({
                                    detail_id:
                                        detail.picking_detail_id,
                                    picked_qty:
                                        detail.requested_qty
                                })
                            )
                    }
                );

                const packing = create(
                    "packing",
                    {
                        picking_id:
                            picking.picking_id
                    }
                );

                if (
                    stage === "packing"
                ) {
                    continue;
                }

                start(
                    "packing",
                    packing
                );

                run(
                    "packing",
                    "complete",
                    {
                        packing_id:
                            packing.packing_id,
                        packages: [
                            {
                                package_type:
                                    "Thùng carton",
                                weight: 5,
                                items:
                                    picking.items.map(
                                        detail => ({
                                            picking_detail_id:
                                                detail.picking_detail_id,
                                            packed_qty:
                                                detail.picked_qty
                                        })
                                    )
                            }
                        ]
                    }
                );

                create(
                    "shipping",
                    {
                        order_id:
                            orderId
                    }
                );
            }

            save(state);

            return {
                success: true,
                stage,
                importedRows:
                    items.length,
                importedQty:
                    items.reduce(
                        (sum, item) =>
                            sum + item.qty,
                        0
                    )
            };
        });
    }

    function orderQuantity(
        state,
        orderId
    ) {
        const picking =
            state.pickings.find(
                row =>
                    Number(row.order_id) ===
                    Number(orderId)
            );

        if (picking) {
            return num(
                picking.requested_total
            );
        }

        return num(
            find(
                state.orders,
                "order_id",
                orderId
            ).total_qty
        );
    }

    function quantityFor(
        state,
        stage,
        row
    ) {
        if (
            stage === "receiving"
        ) {
            return (row.items || [])
                .reduce(
                    (sum, item) =>
                        sum +
                        num(item.expected_qty),
                    0
                );
        }

        if (
            stage === "putaway"
        ) {
            return num(
                row.quantity
            );
        }

        return orderQuantity(
            state,
            row.order_id
        );
    }

    function shippingRemaining(
        state,
        row
    ) {
        const packingIds =
            state.packings.filter(
                p =>
                    Number(p.order_id) ===
                    Number(row.order_id)
            ).map(
                p => Number(p.packing_id)
            );

        return state.packages.filter(
            pkg =>
                packingIds.includes(
                    Number(pkg.packing_id)
                ) &&
                pkg.status === "PACKED"
        ).flatMap(
            pkg => pkg.items || []
        ).reduce(
            (sum, item) =>
                sum +
                num(item.packed_qty),
            0
        );
    }

    function analysis() {
        const state = read();

        const targetHours = 2;

        return Object.entries(
            stages
        ).map(
            ([
                stage,
                [
                    collection,
                    idKey,
                    codeKey
                ]
            ]) => {
                const rows =
                    state[collection];

                const waiting =
                    rows.filter(
                        row =>
                            row.status === "PENDING"
                    );

                const active =
                    rows.filter(
                        row =>
                            row.status === "IN_PROGRESS"
                    );

                let ready = [];

                if (
                    stage === "putaway"
                ) {
                    ready =
                        state.batches.filter(
                            b =>
                                num(b.available_qty) > 0
                        ).map(
                            b =>
                                num(b.available_qty)
                        );
                }

                if (
                    stage === "picking"
                ) {
                    ready =
                        get(
                            "picking",
                            state
                        ).orders.map(
                            o =>
                                num(o.total_qty)
                        );
                }

                if (
                    stage === "packing"
                ) {
                    ready =
                        get(
                            "packing",
                            state
                        ).available_picking.map(
                            p =>
                                num(p.picked_total)
                        );
                }

                if (
                    stage === "shipping"
                ) {
                    ready =
                        state.packings.filter(
                            p =>
                                p.status === "COMPLETED" &&
                                !state.shipping_orders.some(
                                    s =>
                                        Number(s.order_id) ===
                                        Number(p.order_id)
                                )
                        ).map(
                            p =>
                                num(p.packed_qty)
                        );
                }

                const remaining = row =>
                    stage === "shipping"
                        ? shippingRemaining(
                            state,
                            row
                        )
                        : quantityFor(
                            state,
                            stage,
                            row
                        );

                const waitingQty =
                    waiting.reduce(
                        (sum, row) =>
                            sum +
                            remaining(row),
                        0
                    ) +
                    ready.reduce(
                        (sum, qty) =>
                            sum + qty,
                        0
                    );

                const activeQty =
                    active.reduce(
                        (sum, row) =>
                            sum +
                            remaining(row),
                        0
                    );

                const config =
                    state.capacity[stage];

                const workers =
                    amount(
                        config.workers,
                        true
                    );

                const perHour =
                    amount(
                        config.perHour,
                        true
                    );

                const capacity =
                    workers * perHour;

                const workload =
                    waitingQty +
                    activeQty;

                const loadPercent =
                    capacity > 0
                        ? 100 *
                          workload /
                          (
                              capacity *
                              targetHours
                          )
                        : 0;

                const risk =
                    loadPercent > 100
                        ? "HIGH"
                        : loadPercent >= 50
                            ? "MEDIUM"
                            : "LOW";

                const details =
                    rows.map(
                        row => {
                            const quantity =
                                quantityFor(
                                    state,
                                    stage,
                                    row
                                );

                            return {
                                id:
                                    row[idKey],
                                code:
                                    row[codeKey],
                                status:
                                    row.status,
                                quantity,
                                actual:
                                    row.actual_minutes ??
                                    null,
                                minutes:
                                    60 *
                                    quantity /
                                    perHour
                            };
                        }
                    );

                const measured =
                    details.filter(
                        d =>
                            d.actual !== null
                    );

                return {
                    stage,
                    total:
                        rows.length,
                    waiting:
                        waiting.length,
                    active:
                        active.length,
                    ready:
                        ready.length,
                    waitingQty,
                    activeQty,
                    workload,
                    capacity,
                    workers,
                    perHour,
                    targetHours,
                    loadPercent,
                    risk,
                    queueMinutes:
                        capacity > 0
                            ? 60 *
                              workload /
                              capacity
                            : 0,
                    details,
                    average:
                        details.length
                            ? details.reduce(
                                (sum, d) =>
                                    sum +
                                    d.minutes,
                                0
                            ) /
                              details.length
                            : 0,
                    actual:
                        measured.length
                            ? measured.reduce(
                                (sum, d) =>
                                    sum +
                                    d.actual,
                                0
                            ) /
                              measured.length
                            : null
                };
            }
        );
    }

  
    function overview() {
        const state = read();
        const stats = analysis();

        // Tổng số thùng đã thực nhận
        const received = state.receipts
            .filter(row => row.status === "COMPLETED")
            .reduce((total, row) => {
                return total + (row.items || []).reduce(
                    (sum, item) =>
                        sum + num(item.received_qty),
                    0
                );
            }, 0);

        // Tổng số đơn hàng
        const orders = state.orders.length;

        // Số đơn đã xuất kho
        const completed = new Set(
            state.shipping_orders
                .filter(row => row.status === "SHIPPED")
                .map(row => Number(row.order_id))
        ).size;

        // Danh sách phiếu theo từng công đoạn
        const stageRows = {
            receiving: state.receipts,
            putaway: state.putaways,
            picking: state.pickings,
            packing: state.packings,
            shipping: state.shipping_orders
        };

        // Công đoạn có tỷ lệ tải cao nhất
        const bottleneck = [...stats].sort(
            (a, b) => b.loadPercent - a.loadPercent
        )[0] || null;

        return {
            // Tương thích với index.html hiện tại
            received,
            orders,
            completed,
            stages: stageRows,

            // Giữ các trường thống kê bổ sung
            totalOrders: orders,
            totalReceipts: state.receipts.length,
            completedReceipts: state.receipts.filter(
                row => row.status === "COMPLETED"
            ).length,
            completedShipments: state.shipments.filter(
                row => row.delivery_status === "DELIVERED"
            ).length,
            bottleneck,
            stageMetrics: stats,
            inventory: inventory()
        };
    }

    function inventory() {
        const state = read();

        const stock = new Map();

        for (const product of products) {
            stock.set(
                product.product_id,
                {
                    ...product,
                    quantity: 0,
                    locations: []
                }
            );
        }

        for (const task of state.putaways) {
            if (
                task.status !== "COMPLETED" ||
                num(task.stock_qty) <= 0
            ) {
                continue;
            }

            const batch = state.batches.find(
                b =>
                    Number(b.batch_id) ===
                    Number(task.batch_id)
            );

            if (!batch) continue;

            const product = stock.get(
                Number(batch.product_id)
            );

            if (!product) continue;

            product.quantity +=
                num(task.stock_qty);

            product.locations.push({
                location_code:
                    task.destination_location,
                batch_code:
                    task.batch_code,
                quantity:
                    num(task.stock_qty)
            });
        }

        return [...stock.values()];
    }

    async function setCapacity(
        stage,
        workers,
        perHour
    ) {
        if (!stages[stage]) {
            throw new Error(
                "Công đoạn không hợp lệ."
            );
        }

        const validWorkers =
            amount(workers, true);

        const validPerHour =
            amount(perHour, true);

        if (
            validWorkers > 20 ||
            validPerHour > 500
        ) {
            throw new Error(
                "Năng lực vượt giới hạn mô phỏng."
            );
        }

        return locked(() => {
            const state = clone(read());

            state.capacity[stage] = {
                workers: validWorkers,
                perHour: validPerHour
            };

            save(state);

            return {
                success: true,
                stage,
                workers: validWorkers,
                perHour: validPerHour
            };
        });
    }

    async function resetScenario() {
        return locked(() => {
            const previous =
                localStorage.getItem(key);

            if (previous) {
                localStorage.setItem(
                    key + ":backup",
                    previous
                );
            }

            const state = freshState();

            seed(state);
            save(state);

            return {
                success: true
            };
        });
    }

    async function restoreLegacy() {
        return locked(() => {
            const raw =
                localStorage.getItem(
                    "wms_operations_v1"
                );

            if (!raw) {
                throw new Error(
                    "Không có dữ liệu phiên bản cũ."
                );
            }

            const state =
                JSON.parse(raw);

            for (
                const [collection]
                of Object.values(stages)
            ) {
                if (
                    !Array.isArray(
                        state[collection]
                    )
                ) {
                    throw new Error(
                        "Dữ liệu cũ không đúng định dạng."
                    );
                }
            }

            state.orders =
                clone(orders);

            for (
                const order
                of state.orders
            ) {
                const picking =
                    state.pickings.find(
                        p =>
                            Number(p.order_id) ===
                            order.order_id
                    );

                if (picking) {
                    order.total_qty =
                        num(
                            picking.requested_total
                        );
                }
            }

            state.capacity =
                clone(defaults);

            normalizeState(state);

            const previous =
                localStorage.getItem(key);

            if (previous) {
                localStorage.setItem(
                    key + ":backup",
                    previous
                );
            }

            save(state);

            return {
                success: true
            };
        });
    }

    function exportData() {
        return JSON.stringify(
            read(),
            null,
            2
        );
    }

    return {
        request,
        overview,
        importReceivingCsv,
        importStageScenario,
        analysis,
        inventory,
        setCapacity,
        resetScenario,
        restoreLegacy,
        exportData,
        storageKey: key,
        stageNames
    };
})();
