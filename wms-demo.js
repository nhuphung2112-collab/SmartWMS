/* Browser-local data for the static WMS demo. */
const WmsDemo = (() => {
    const directory = typeof location === "undefined" ? "/test/" : new URL(".", location.href).pathname;
    const key = "smartwms:v2:" + directory;
    const defaults = {
        receiving: {workers: 2, perHour: 40}, putaway: {workers: 2, perHour: 50},
        picking: {workers: 2, perHour: 30}, packing: {workers: 2, perHour: 25},
        shipping: {workers: 2, perHour: 60}
    };
    const stages = {
        receiving: ["receipts", "receipt_id", "receipt_code", "RCV"],
        putaway: ["putaways", "putaway_id", "putaway_code", "PUT"],
        picking: ["pickings", "picking_id", "picking_code", "PCK"],
        packing: ["packings", "packing_id", "packing_code", "PKG"],
        shipping: ["shipping_orders", "shipping_order_id", "shipping_code", "SHP"]
    };
    const products = [
        {product_id: 1, sku: "SKU-001", product_name: "Thùng hàng A", unit: "thùng"},
        {product_id: 2, sku: "SKU-002", product_name: "Thùng hàng B", unit: "thùng"}
    ];
    const suppliers = [{supplier_id: 1, supplier_name: "Nhà cung cấp mô phỏng"}];
    const employees = [{employee_id: 1, employee_name: "Nhân viên kho"}];
    const locations = [
        {location_id: 1, location_code: "DOCK-01"},
        {location_id: 2, location_code: "STO-A01"},
        {location_id: 3, location_code: "STO-A02"}
    ];
    const orders = Array.from({length: 30}, (_, index) => index + 1).map(order_id => ({
        order_id, order_code: "SO-" + String(order_id).padStart(3, "0"), priority: "Thường",
        order_date: new Date().toLocaleDateString("vi-VN"), required_date: new Date(Date.now() + 86400000).toLocaleDateString("vi-VN"),
        line_count: 1, total_qty: 4 + order_id % 5, product_id: order_id % 2 ? 1 : 2
    }));

    function read() {
        const saved = JSON.parse(localStorage.getItem(key));
        if (saved && Object.values(stages).some(([name]) => saved[name]?.length)) return saved;
        const state = {
            orders: structuredClone(orders), capacity: structuredClone(defaults), nextId: 100, receipts: [], batches: [], putaways: [], pickings: [],
            packings: [], packages: [], shipments: [], shipping_orders: []
        };
        seed(state);
        localStorage.setItem(key, JSON.stringify(state));
        return state;
    }

    function seed(state) {
        const run = (stage, action, data) => execute(stage, {action, employee_id: 1, ...data}, state);
        const create = (stage, data) => {
            run(stage, "create", data);
            return state[stages[stage][0]].at(-1);
        };
        const start = (stage, row) => run(stage, "start", row);
        for (let i = 0; i < 14; i++) {
            const arrival = new Date();
            arrival.setHours(8, i * 15, 0, 0);
            const receipt = create("receiving", {supplier_id: 1, dock_number: "DOCK-01", arrival_time: arrival.toLocaleString("vi-VN"),
                items: [{product_id: 1, expected_qty: 20 + i}, {product_id: 2, expected_qty: 18 + i}]});
            if (i >= 6) continue;
            start("receiving", receipt);
            run("receiving", "complete", {receipt_id: receipt.receipt_id,
                items: receipt.items.map(item => ({receiving_item_id: item.receiving_item_id,
                    received_qty: item.expected_qty, accepted_qty: item.expected_qty, rejected_qty: 0, qc_result: "PASS"}))});
        }
        for (const [index, batch] of state.batches.entries()) {
            const task = create("putaway", {batch_id: batch.batch_id, quantity: batch.available_qty,
                destination_location_id: batch.product_id + 1});
            if (index >= 10) continue;
            start("putaway", task);
            run("putaway", "complete", task);
        }
        for (let order_id = 1; order_id <= 22; order_id++) {
            const picking = create("picking", {order_id});
            start("picking", picking);
            if (order_id > 20) continue;
            run("picking", "complete", {picking_id: picking.picking_id,
                picked_items: picking.items.map(item => ({detail_id: item.picking_detail_id, picked_qty: item.requested_qty}))});
            const packing = create("packing", {picking_id: picking.picking_id});
            if (order_id > 18) continue;
            start("packing", packing);
            run("packing", "complete", {packing_id: packing.packing_id, packages: [{
                package_type: "Thùng carton", weight: 5,
                items: picking.items.map(item => ({picking_detail_id: item.picking_detail_id, packed_qty: item.picked_qty}))
            }]});
            if (order_id > 12) continue;
            const shipping = create("shipping", {order_id});
            if (order_id > 10) continue;
            start("shipping", shipping);
            run("shipping", "create_shipment", {shipping_order_id: shipping.shipping_order_id,
                carrier_name: "Vận tải demo", vehicle_number: "51C-12345",
                package_ids: [state.packages.at(-1).packaging_unit_id]});
            run("shipping", "update_delivery", {shipment_id: state.shipments.at(-1).shipment_id, delivery_status: "DELIVERED"});
        }
    }

    function amount(value, positive = false) {
        const result = Number(value);
        if (!Number.isSafeInteger(result) || result < (positive ? 1 : 0)) throw new Error("Số lượng thùng phải là số nguyên hợp lệ.");
        return result;
    }

    function save(state) {
        localStorage.setItem(key, JSON.stringify(state));
        if (typeof window !== "undefined") window.dispatchEvent(new Event("wms:change"));
    }

    async function locked(action) {
        if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(key, action);
        return action();
    }

    async function request(stage, payload) {
        if (!stages[stage]) throw new Error("Công đoạn không hợp lệ.");
        return locked(() => execute(stage, payload));
    }

    function find(rows, field, id) {
        const row = rows.find(item => Number(item[field]) === Number(id));
        if (!row) throw new Error("Không tìm thấy dữ liệu phù hợp.");
        return row;
    }

    function get(stage, state) {
        const common = {products, suppliers, employees, locations};
        switch (stage) {
            case "receiving": return {...common, receipts: state.receipts};
            case "putaway": return {...common, tasks: state.putaways, batches: state.batches.filter(x => x.available_qty > 0)};
            case "picking": return {...common, tasks: state.pickings, orders: state.orders.filter(o => !state.pickings.some(p => Number(p.order_id) === o.order_id))};
            case "packing": return {
                ...common, tasks: state.packings, packages: state.packages,
                details: state.packages.flatMap(p => p.items.map(i => ({...i, ...p}))),
                available_picking: state.pickings.filter(p => p.status === "COMPLETED" && !state.packings.some(t => t.order_id === p.order_id))
            };
            case "shipping": return {...common, shipping_orders: state.shipping_orders,
                shipments: state.shipments, packages: state.packages.filter(p => p.status === "SHIPPED")};
        }
    }

    function execute(stage, payload, seedState) {
        const state = seedState || read();
        if (!payload) return {data: get(stage, state)};
        const [collection, idKey, codeKey, prefix] = stages[stage];
        const rows = state[collection];
        const {action, ...data} = structuredClone(payload);
        for (const field of ["employee_id", "supplier_id", "order_id", "picking_id", "batch_id", "destination_location_id"]) {
            if (field in data) data[field] = Number(data[field]);
        }
        const nextId = () => state.nextId++;
        if (action === "details") return {data: find(rows, idKey, data[idKey]).items};

        if (action === "create") {
            const id = nextId();
            const employee = find(employees, "employee_id", data.employee_id);
            const row = {...data, [idKey]: id, [codeKey]: prefix + "-" + id,
                employee_name: employee.employee_name, status: "PENDING"};
            if (stage === "receiving") {
                row.supplier_name = find(suppliers, "supplier_id", data.supplier_id).supplier_name;
                if (!Array.isArray(data.items) || !data.items.length) throw new Error("Phiếu nhận cần ít nhất một sản phẩm.");
                row.items = data.items.map(item => ({
                    ...item, ...find(products, "product_id", item.product_id),
                    expected_qty: amount(item.expected_qty, true), receiving_item_id: nextId()
                }));
            }
            if (stage === "putaway") {
                const batch = find(state.batches, "batch_id", data.batch_id);
                const quantity = amount(data.quantity, true);
                row.quantity = quantity;
                if (!(quantity > 0 && quantity <= batch.available_qty)) throw new Error("Số lượng vượt quá lô hàng khả dụng.");
                batch.available_qty -= quantity;
                row.product_name = batch.product_name;
                row.batch_code = batch.batch_code;
                row.destination_location = find(locations, "location_id", data.destination_location_id).location_code;
                if (!row.destination_location.startsWith("STO")) throw new Error("Hãy chọn vị trí lưu trữ STO.");
            }
            if (stage === "picking") {
                const order = find(get(stage, state).orders, "order_id", data.order_id);
                let remaining = order.total_qty;
                row.items = [];
                for (const stock of state.putaways.filter(p => p.status === "COMPLETED" && p.stock_qty > 0)) {
                    const batch = find(state.batches, "batch_id", stock.batch_id);
                    if (batch.product_id !== order.product_id || remaining <= 0) continue;
                    const quantity = Math.min(remaining, stock.stock_qty);
                    stock.stock_qty -= quantity;
                    remaining -= quantity;
                    row.items.push({...find(products, "product_id", batch.product_id),
                        picking_detail_id: nextId(), batch_code: batch.batch_code,
                        location_code: stock.destination_location, requested_qty: quantity, picked_qty: 0});
                }
                if (remaining > 0) throw new Error("Tồn kho khả dụng chưa đủ. Đơn cần " + order.total_qty + " thùng, còn thiếu " + remaining + " thùng đúng SKU.");
                Object.assign(row, {order_id: order.order_id, order_code: order.order_code,
                    detail_count: row.items.length, requested_total: order.total_qty, picked_total: 0});
            }
            if (stage === "packing") {
                const picking = find(get(stage, state).available_picking, "picking_id", data.picking_id);
                Object.assign(row, {order_id: picking.order_id, order_code: picking.order_code, package_count: 0, packed_qty: 0});
            }
            if (stage === "shipping") {
                const packing = find(state.packings.filter(p => p.status === "COMPLETED"), "order_id", data.order_id);
                if (rows.some(r => r.order_id === packing.order_id)) throw new Error("Đơn hàng đã có phiếu xuất.");
                Object.assign(row, {order_id: packing.order_id, order_code: packing.order_code,
                    created_time: new Date().toLocaleString("vi-VN"), package_count: 0});
            }
            rows.push(row);
        } else if (action === "update_delivery" && stage === "shipping") {
            const shipment = find(state.shipments, "shipment_id", data.shipment_id);
            if (!["DELIVERED", "FAILED"].includes(data.delivery_status)) throw new Error("Trạng thái giao hàng không hợp lệ.");
            if (shipment.delivery_status === "DELIVERED" && data.delivery_status !== "DELIVERED") throw new Error("Chuyến đã giao thành công.");
            shipment.delivery_status = data.delivery_status;
        } else {
            const row = find(rows, idKey, data[idKey]);
            if (action === "start" && row.status === "PENDING") {
                row.status = "IN_PROGRESS";
                if (!seedState) row.started_at = new Date().toISOString();
            } else if (action === "complete" && row.status === "IN_PROGRESS" && stage !== "shipping") {
                if (stage === "receiving") {
                    for (const item of row.items) {
                        const input = find(data.items, "receiving_item_id", item.receiving_item_id);
                        const qc = {received_qty: amount(input.received_qty), accepted_qty: amount(input.accepted_qty),
                            rejected_qty: amount(input.rejected_qty), qc_result: input.qc_result, qc_note: input.qc_note || ""};
                        if (qc.accepted_qty + qc.rejected_qty !== qc.received_qty) throw new Error("Số đạt và số loại phải bằng số thực nhận.");
                        if (qc.qc_result === "FAIL" && qc.accepted_qty > 0) throw new Error("Hàng QC không đạt không thể đưa vào tồn khả dụng.");
                        Object.assign(item, qc);
                        if (qc.accepted_qty > 0) {
                            const id = nextId();
                            state.batches.push({...item, batch_id: id, batch_code: "LOT-" + id, available_qty: qc.accepted_qty});
                        }
                    }
                }
                if (stage === "putaway") row.stock_qty = Number(row.quantity);
                if (stage === "picking") {
                    for (const item of row.items) {
                        const picked = find(data.picked_items, "detail_id", item.picking_detail_id);
                        if (picked.picked_qty !== item.requested_qty) throw new Error("Cần lấy đủ số lượng yêu cầu.");
                        item.picked_qty = picked.picked_qty;
                    }
                    row.picked_total = row.requested_total;
                }
                if (stage === "packing") {
                    const picking = find(state.pickings, "picking_id", row.picking_id);
                    for (const picked of picking.items) {
                        const packed = data.packages.flatMap(p => p.items)
                            .filter(i => i.picking_detail_id === picked.picking_detail_id)
                            .reduce((total, item) => total + amount(item.packed_qty, true), 0);
                        if (packed !== picked.picked_qty) throw new Error("Cần đóng đủ số lượng đã lấy cho từng dòng.");
                    }
                    for (const pkg of data.packages) {
                        const id = nextId();
                        if (!pkg.items.length) throw new Error("Kiện phải có sản phẩm.");
                        const items = pkg.items.map(item => ({...find(picking.items, "picking_detail_id", item.picking_detail_id),
                            packed_qty: amount(item.packed_qty, true), condition_status: item.condition_status || "GOOD"}));
                        state.packages.push({...pkg, items, packaging_unit_id: id, package_code: "BOX-" + id,
                            packing_id: row.packing_id, packing_code: row.packing_code, status: "PACKED"});
                        row.packed_qty += items.reduce((total, item) => total + amount(item.packed_qty, true), 0);
                        row.package_count++;
                    }
                }
                row.status = "COMPLETED";
                if (!seedState && row.started_at) {
                    row.completed_at = new Date().toISOString();
                    row.actual_minutes = (Date.parse(row.completed_at) - Date.parse(row.started_at)) / 60000;
                }
            } else if (action === "create_shipment" && stage === "shipping" && row.status === "IN_PROGRESS") {
                const packing = find(state.packings, "order_id", row.order_id);
                const available = state.packages.filter(p => p.packing_id === packing.packing_id && p.status === "PACKED");
                const packages = [...new Set(data.package_ids.map(Number))].map(id => find(available, "packaging_unit_id", id));
                if (!packages.length) throw new Error("Hãy chọn kiện hàng.");
                packages.forEach(pkg => { pkg.status = "SHIPPED"; });
                const id = nextId();
                state.shipments.push({...data, shipment_id: id, shipment_code: "TRIP-" + id,
                    shipping_code: row.shipping_code, order_code: row.order_code, delivery_status: "PENDING"});
                row.package_count += packages.length;
                if (available.every(pkg => pkg.status === "SHIPPED")) row.status = "SHIPPED";
            } else {
                throw new Error("Thao tác không phù hợp với trạng thái hiện tại.");
            }
        }
        if (!seedState) save(state);
        return {success: true, message: "Đã lưu dữ liệu mô phỏng."};
    }

    function overview() {
        const state = read();
        return {
            received: state.receipts.flatMap(r => r.items).reduce((total, item) => total + (item.received_qty || 0), 0),
            orders: state.orders.length,
            pendingOrders: state.orders.filter(o => !state.pickings.some(p => Number(p.order_id) === o.order_id)).length,
            completed: state.shipping_orders.filter(r => r.status === "SHIPPED").length,
            stages: Object.fromEntries(Object.entries(stages).map(([stage, [collection]]) => [stage, state[collection]]))
        };
    }

    function importReceivingCsv(text) {
        const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
        const delimiter = lines[0].includes(";") ? ";" : ",";
        const split = line => line.split(delimiter).map(value => value.trim());
        const header = split(lines[0]).map(value => value.toLowerCase());
        if (header.length !== 2 || header[0] !== "sku" || header[1] !== "quantity") {
            throw new Error("Dòng đầu phải gồm hai cột sku và quantity.");
        }

        const quantities = new Map();
        lines.slice(1).forEach((line, index) => {
            if (!line.trim()) return;
            const [sku, rawQuantity, ...extra] = split(line);
            const product = products.find(item => item.sku === sku.toUpperCase());
            const quantity = Number(rawQuantity);
            if (extra.length || !product || !Number.isSafeInteger(quantity) || quantity < 1) {
                throw new Error("Dòng " + (index + 2) + " cần SKU hợp lệ và số lượng thùng nguyên dương.");
            }
            const total = (quantities.get(product.product_id) || 0) + quantity;
            if (!Number.isSafeInteger(total)) throw new Error("Tổng số lượng vượt giới hạn.");
            quantities.set(product.product_id, total);
        });

        if (!quantities.size) throw new Error("Hãy thêm ít nhất một dòng hàng.");
        return request("receiving", {
            action: "create", supplier_id: 1, employee_id: 1, dock_number: "DOCK-01",
            note: "Nhập từ CSV",
            items: [...quantities].map(([product_id, expected_qty]) => ({product_id, expected_qty}))
        });
    }

    function orderQuantity(state, orderId) {
        const picking = state.pickings.find(row => Number(row.order_id) === Number(orderId));
        if (picking) return Number(picking.requested_total);
        return Number(find(state.orders, "order_id", orderId).total_qty);
    }

    function quantityFor(state, stage, row) {
        if (stage === "receiving") return row.items.reduce((sum, item) => sum + Number(item.expected_qty), 0);
        if (stage === "putaway") return Number(row.quantity);
        return orderQuantity(state, row.order_id);
    }

    function analysis() {
        const state = read();
        const targetHours = 2;
        return Object.entries(stages).map(([stage, [collection, idKey, codeKey]]) => {
            const rows = state[collection];
            const waiting = rows.filter(row => row.status === "PENDING");
            const active = rows.filter(row => row.status === "IN_PROGRESS");
            let ready = [];
            if (stage === "putaway") ready = state.batches.filter(b => b.available_qty > 0).map(b => Number(b.available_qty));
            if (stage === "picking") ready = get("picking", state).orders.map(o => Number(o.total_qty));
            if (stage === "packing") ready = get("packing", state).available_picking.map(p => Number(p.picked_total));
            if (stage === "shipping") ready = state.packings.filter(p => p.status === "COMPLETED" && !state.shipping_orders.some(s => Number(s.order_id) === Number(p.order_id))).map(p => Number(p.packed_qty));
            const remaining = row => {
                if (stage !== "shipping") return quantityFor(state, stage, row);
                const packingIds = state.packings.filter(p => Number(p.order_id) === Number(row.order_id)).map(p => p.packing_id);
                return state.packages.filter(p => packingIds.includes(p.packing_id) && p.status !== "SHIPPED")
                    .flatMap(p => p.items).reduce((sum, i) => sum + Number(i.packed_qty), 0);
            };
            const waitingQty = waiting.reduce((sum, row) => sum + remaining(row), 0) + ready.reduce((sum, qty) => sum + qty, 0);
            const activeQty = active.reduce((sum, row) => sum + remaining(row), 0);
            const {workers, perHour} = state.capacity[stage];
            const capacity = workers * perHour;
            const workload = waitingQty + activeQty;
            const loadPercent = 100 * workload / (capacity * targetHours);
            const risk = loadPercent > 100 ? "HIGH" : loadPercent >= 50 ? "MEDIUM" : "LOW";
            const details = rows.map(row => ({id: row[idKey], code: row[codeKey], status: row.status,
                quantity: quantityFor(state, stage, row), actual: row.actual_minutes ?? null,
                minutes: 60 * quantityFor(state, stage, row) / perHour}));
            const measured = details.filter(d => d.actual !== null);
            return {stage, total: rows.length, waiting: waiting.length, active: active.length, ready: ready.length,
                waitingQty, activeQty, workload, capacity, workers, perHour, targetHours, loadPercent, risk,
                queueMinutes: 60 * workload / capacity, details,
                average: details.length ? details.reduce((sum, d) => sum + d.minutes, 0) / details.length : 0,
                actual: measured.length ? measured.reduce((sum, d) => sum + d.actual, 0) / measured.length : null};
        });
    }

    function inventory() {
        const state = read();
        return products.map(product => {
            const sum = (items, field) => items.filter(i => Number(i.product_id) === product.product_id)
                .reduce((total, i) => total + Number(i[field] || 0), 0);
            const accepted = sum(state.receipts.flatMap(r => r.items), "accepted_qty");
            const received = sum(state.receipts.flatMap(r => r.items), "received_qty");
            const rejected = sum(state.receipts.flatMap(r => r.items), "rejected_qty");
            const batchIds = state.batches.filter(b => Number(b.product_id) === product.product_id).map(b => b.batch_id);
            const putaways = state.putaways.filter(p => batchIds.includes(Number(p.batch_id)));
            const toStore = sum(state.batches, "available_qty") + putaways.filter(p => p.status !== "COMPLETED").reduce((total, p) => total + Number(p.quantity), 0);
            const free = putaways.reduce((total, p) => total + Number(p.stock_qty || 0), 0);
            const reserved = sum(state.pickings.filter(p => p.status !== "COMPLETED").flatMap(p => p.items), "requested_qty");
            const picked = sum(state.pickings.filter(p => p.status === "COMPLETED").flatMap(p => p.items), "picked_qty");
            const packed = sum(state.packages.flatMap(p => p.items), "packed_qty");
            const shipped = sum(state.packages.filter(p => p.status === "SHIPPED").flatMap(p => p.items), "packed_qty");
            return {...product, received, accepted, rejected, toStore, free, reserved,
                toPack: picked - packed, toShip: packed - shipped, shipped};
        });
    }

    async function setCapacity(stage, workers, perHour) {
        if (!stages[stage]) throw new Error("Công đoạn không hợp lệ.");
        workers = amount(workers, true);
        perHour = amount(perHour, true);
        if (workers > 20 || perHour > 500) throw new Error("Chọn tối đa 20 nhân viên và 500 thùng/người/giờ.");
        return locked(() => {
            const state = read();
            state.capacity[stage] = {workers, perHour};
            save(state);
        });
    }

    async function resetScenario() {
        return locked(() => {
            const previous = localStorage.getItem(key);
            if (previous) localStorage.setItem(key + ":backup", previous);
            const state = {orders: structuredClone(orders), capacity: structuredClone(defaults), nextId: 100,
                receipts: [], batches: [], putaways: [], pickings: [], packings: [], packages: [], shipments: [], shipping_orders: []};
            seed(state);
            save(state);
        });
    }

    async function restoreLegacy() {
        return locked(() => {
            const raw = localStorage.getItem("wms_operations_v1");
            if (!raw) throw new Error("Không có dữ liệu phiên bản cũ trên trình duyệt này.");
            const state = JSON.parse(raw);
            for (const [collection] of Object.values(stages)) {
                if (!Array.isArray(state[collection])) throw new Error("Dữ liệu cũ không đúng định dạng.");
            }
            state.orders = structuredClone(orders);
            for (const order of state.orders) {
                const picking = state.pickings.find(p => Number(p.order_id) === order.order_id);
                if (picking) order.total_qty = Number(picking.requested_total);
            }
            state.capacity = structuredClone(defaults);
            const previous = localStorage.getItem(key);
            if (previous) localStorage.setItem(key + ":backup", previous);
            save(state);
        });
    }

    function exportData() {
        return JSON.stringify(read(), null, 2);
    }

async function importStageScenario(stage, csvText) {
    if (!stages[stage]) {
        throw new Error("Công đoạn không hợp lệ.");
    }

    const lines = String(csvText || "")
        .replace(/^\uFEFF/, "")
        .trim()
        .split(/\r?\n/);

    const delimiter = (lines[0] || "").includes(";") ? ";" : ",";
    const split = line => line.split(delimiter).map(x => x.trim());

    const header = split(lines[0] || "").map(x => x.toLowerCase());

    if (header.join(",") !== "sku,quantity") {
        throw new Error("CSV phải có hai cột: sku,quantity.");
    }

    const items = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const cells = split(lines[i]);
        const product = products.find(
            p => p.sku === String(cells[0]).toUpperCase()
        );
        const qty = Number(cells[1]);

        if (
            cells.length !== 2 ||
            !product ||
            !Number.isSafeInteger(qty) ||
            qty <= 0
        ) {
            throw new Error(
                "Dữ liệu không hợp lệ tại dòng " + (i + 1)
            );
        }

        items.push({product_id: product.product_id, qty});
    }

    if (!items.length) {
        throw new Error("CSV chưa có dữ liệu.");
    }

    if (items.length > 100) {
        throw new Error("Mỗi lần chỉ nhập tối đa 100 dòng.");
    }

    return locked(() => {
        // Làm việc trên bản sao để tránh lưu dữ liệu dở dang.
        const state = structuredClone(read());

        const run = (step, action, data = {}) =>
            execute(step, {
                action,
                employee_id: 1,
                ...data
            }, state);

        const create = (step, data) => {
            run(step, "create", data);
            return state[stages[step][0]].at(-1);
        };

        const start = (step, row) => run(step, "start", row);

        const completeReceiving = receipt => {
            start("receiving", receipt);

            run("receiving", "complete", {
                receipt_id: receipt.receipt_id,
                items: receipt.items.map(item => ({
                    receiving_item_id: item.receiving_item_id,
                    received_qty: item.expected_qty,
                    accepted_qty: item.expected_qty,
                    rejected_qty: 0,
                    qc_result: "PASS"
                }))
            });
        };

        for (const item of items) {
            // 1. Tạo phiếu nhận hàng mới.
            const receipt = create("receiving", {
                supplier_id: 1,
                dock_number: "DOCK-01",
                arrival_time: new Date().toLocaleString("vi-VN"),
                note: "Kịch bản cộng dồn",
                items: [{
                    product_id: item.product_id,
                    expected_qty: item.qty
                }]
            });

            // Nhập tại Nhận hàng: giữ phiếu ở trạng thái chờ.
            if (stage === "receiving") continue;

            // 2. Hoàn thành Nhận hàng để có lô hợp lệ.
            completeReceiving(receipt);

            const batch = state.batches.at(-1);

            // 3. Tạo phiếu Cất hàng.
            const putaway = create("putaway", {
                batch_id: batch.batch_id,
                quantity: item.qty,
                destination_location_id: item.product_id + 1
            });

            if (stage === "putaway") continue;

            // 4. Hoàn thành Cất hàng để tạo tồn khả dụng.
            start("putaway", putaway);
            run("putaway", "complete", {
                putaway_id: putaway.putaway_id
            });

            // 5. Tạo đơn hàng mô phỏng riêng.
            const orderId = state.nextId++;

            state.orders.push({
                order_id: orderId,
                order_code: "SO-SIM-" + orderId,
                priority: "Thường",
                order_date: new Date().toLocaleDateString("vi-VN"),
                required_date: new Date().toLocaleDateString("vi-VN"),
                line_count: 1,
                total_qty: item.qty,
                product_id: item.product_id
            });

            const picking = create("picking", {
                order_id: orderId
            });

            if (stage === "picking") continue;

            // 6. Hoàn thành Lấy hàng.
            start("picking", picking);

            run("picking", "complete", {
                picking_id: picking.picking_id,
                picked_items: picking.items.map(detail => ({
                    detail_id: detail.picking_detail_id,
                    picked_qty: detail.requested_qty
                }))
            });

            // 7. Tạo phiếu Đóng gói.
            const packing = create("packing", {
                picking_id: picking.picking_id
            });

            if (stage === "packing") continue;

            // 8. Hoàn thành Đóng gói để tạo kiện hàng.
            start("packing", packing);

            run("packing", "complete", {
                packing_id: packing.packing_id,
                packages: [{
                    package_type: "Thùng carton",
                    weight: 5,
                    items: picking.items.map(detail => ({
                        picking_detail_id: detail.picking_detail_id,
                        packed_qty: detail.picked_qty
                    }))
                }]
            });

            // 9. Tạo phiếu Xuất hàng đang chờ.
            create("shipping", {
                order_id: orderId
            });
        }

        // Chỉ lưu khi toàn bộ dữ liệu đã tạo thành công.
        save(state);

        return {
            success: true,
            stage,
            importedRows: items.length,
            importedQty: items.reduce((sum, x) => sum + x.qty, 0)
        };
    });
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
        storageKey: key
    };
})();

