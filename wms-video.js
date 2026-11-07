(() => {
    const names = {receiving:'Nhận hàng',putaway:'Cất hàng',picking:'Lấy hàng',packing:'Đóng gói',shipping:'Xuất hàng'};
    const statusNames = {PENDING:'Chờ xử lý',IN_PROGRESS:'Đang xử lý',COMPLETED:'Hoàn tất',SHIPPED:'Đã xuất'};
    const riskNames = {HIGH:'Quá tải',MEDIUM:'Cần theo dõi',LOW:'Trong năng lực'};
    const fmt = n => Number(n).toLocaleString('vi-VN',{maximumFractionDigits:1});
    const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const badge = s => '<span class="status '+(s.risk==='HIGH'?'warning':'')+'">'+riskNames[s.risk]+'</span>';
    const metric = (label,value,note='') => '<div class="overview-card"><p>'+label+'</p><h2>'+value+'</h2><small>'+note+'</small></div>';

    function render() {
        const stats = WmsDemo.analysis();
        const worst = [...stats].sort((a,b)=>b.loadPercent-a.loadPercent)[0];
        const summary = document.getElementById('video-summary');
        if (summary) summary.textContent = worst.workload
            ? names[worst.stage]+' · '+fmt(worst.workload)+' thùng cần xử lý · '+fmt(worst.loadPercent)+'% năng lực trong 2 giờ'
            : 'Đã xử lý hết khối lượng đang chờ ở cả 5 công đoạn';
        const results = document.getElementById('video-results');
        if (!results) return;
        const total = stats.reduce((sum,s)=>sum+s.total,0);
        let html = '<div class="overview-grid">'+metric('Công đoạn có tỷ lệ tải cao nhất',names[worst.stage],riskNames[worst.risk])
            +metric('Khối lượng tại công đoạn',fmt(worst.workload)+' thùng',fmt(worst.waitingQty)+' chờ · '+fmt(worst.activeQty)+' đang xử lý')
            +metric('Năng lực công đoạn',fmt(worst.capacity)+' thùng/giờ',worst.workers+' người × '+worst.perHour+' thùng/người/giờ')
            +metric('Thời gian giải phóng khối lượng',fmt(worst.queueMinutes)+' phút','Giả định không có thêm hàng đến')+'</div>';
        const max = Math.max(1,...stats.flatMap(s=>[s.average,s.actual||0]));
        const bar = (label,value,color) => '<div class="comparison"><span>'+label+'</span><div><i style="width:'+100*value/max+'%;background:'+color+'"></i></div><b>'+fmt(value)+' phút</b></div>';
        html += '<section class="panel"><h2>Thời gian xử lý trung bình một phiếu</h2>'
            +stats.map(s=>'<div class="chart-group"><strong>'+names[s.stage]+'</strong>'+bar('Ước tính',s.average,'#6389a3')
                +(s.actual===null?'<p class="card-note">Chưa ghi nhận thời gian thao tác.</p>':bar('Đã ghi nhận',s.actual,'#559b8b'))+'</div>').join('')
            +'<p class="card-note">Một nhân viên xử lý một phiếu. Ước tính = số thùng ÷ năng suất cá nhân. Thời gian đã ghi nhận đo từ lúc bấm Bắt đầu đến Hoàn tất trên web.</p></section>';
        html += '<section class="panel"><h2>Khối lượng và năng lực xử lý</h2><p>'+total+' phiếu · Hàng đã đủ điều kiện nhưng chưa tạo phiếu vẫn được tính vào khối lượng chờ.</p><div class="table-wrap"><table><thead><tr><th>Công đoạn</th><th>Phiếu chờ</th><th>Đang xử lý</th><th>Sẵn sàng tạo phiếu</th><th>Thùng cần xử lý</th><th>Năng lực / 2 giờ</th><th>Tỷ lệ tải</th><th>Đánh giá</th></tr></thead><tbody>';
        html += stats.map(s=>'<tr><td><a href="stage.html?stage='+s.stage+'">'+names[s.stage]+'</a></td><td>'+s.waiting+'</td><td>'+s.active+'</td><td>'+s.ready+'</td><td>'+fmt(s.workload)+'</td><td>'+fmt(s.capacity*2)+'</td><td>'+fmt(s.loadPercent)+'%</td><td>'+badge(s)+'</td></tr>').join('')+'</tbody></table></div></section>';
        if (document.body.dataset.mode === 'ai') {
            html += '<section class="panel"><h2>Chi tiết theo phiếu</h2><div class="table-wrap"><table><thead><tr><th>Mã phiếu</th><th>Công đoạn</th><th>Thùng</th><th>Dự kiến (phút)</th><th>Đã ghi nhận (phút)</th><th>Trạng thái</th></tr></thead><tbody>';
            html += stats.flatMap(s=>s.details.map(d=>'<tr><td>'+esc(d.code)+'</td><td>'+names[s.stage]+'</td><td>'+fmt(d.quantity)+'</td><td>'+fmt(d.minutes)+'</td><td>'+(d.actual===null?'—':fmt(d.actual))+'</td><td>'+esc(statusNames[d.status]||d.status)+'</td></tr>')).join('')+'</tbody></table></div></section>';
        } else {
            html += '<section class="panel"><h2>Điều chỉnh năng lực mô phỏng</h2><p>Năng suất dưới đây là giả định của kịch bản. Khi đổi nhân sự, thời gian giải phóng hàng chờ và tỷ lệ tải được tính lại trên toàn web.</p><form id="capacity-form" class="capacity-controls"><label>Công đoạn<select name="stage">'+stats.map(s=>'<option value="'+s.stage+'">'+names[s.stage]+'</option>').join('')+'</select></label><label>Số người<input name="workers" type="number" min="1" max="20" required></label><label>Thùng/người/giờ<input name="perHour" type="number" min="1" max="500" required></label><button class="btn btn-primary">Áp dụng</button></form><p id="capacity-status" role="status"></p></section>';
            const requiredWorkers = Math.ceil(worst.workload/(2*worst.perHour));
            html += '<section class="panel"><h2>Đề xuất xử lý</h2><p>'+(worst.risk==='HIGH'
                ? 'Để xử lý hết '+fmt(worst.workload)+' thùng ở '+names[worst.stage]+' trong 2 giờ, cần khoảng '+requiredWorkers+' người với năng suất '+worst.perHour+' thùng/người/giờ. Hiện đang bố trí '+worst.workers+' người.'
                : 'Khối lượng hiện tại nằm trong năng lực xử lý 2 giờ theo các giả định đã chọn.')+'</p><p>Ưu tiên phiếu đến trước, kiểm đếm và hoàn tất QC. Hàng đạt chuyển sang Cất hàng, nên cần theo dõi tiếp tải tại công đoạn sau.</p><a class="btn btn-primary" href="stage.html?stage='+worst.stage+'">Mở công đoạn</a></section>';
        }
        results.innerHTML = html;
        const form = document.getElementById('capacity-form');
        if (form) {
            function fill() {
                const selected = stats.find(s=>s.stage===form.elements.stage.value);
                form.elements.workers.value = selected.workers;
                form.elements.perHour.value = selected.perHour;
            }
            form.elements.stage.value = worst.stage;
            form.elements.stage.addEventListener('change',fill);
            fill();
            form.addEventListener('submit',async event=>{
                event.preventDefault();
                try {
                    await WmsDemo.setCapacity(form.elements.stage.value,form.elements.workers.value,form.elements.perHour.value);
                    document.getElementById('capacity-status').textContent = 'Đã cập nhật năng lực và các chỉ số.';
                } catch(error) { document.getElementById('capacity-status').textContent = error.message; }
            });
        }
    }
    render();
    window.addEventListener('storage',event=>{if(event.key===WmsDemo.storageKey) render();});
    window.addEventListener('wms:change',render);
    window.addEventListener('pageshow',render);
})();
