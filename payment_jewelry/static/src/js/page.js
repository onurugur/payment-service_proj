/** @odoo-module alias=paylox.system.jewelry **/
'use strict';

import publicWidget from 'web.public.widget';
import core from 'web.core';
import rpc from 'web.rpc';
import dialog from 'web.Dialog';
import fields from 'paylox.fields';
import payloxPage from 'paylox.page';
import framework from 'paylox.framework';
import systemPage from 'paylox.system.page';
import { format } from 'paylox.tools';

const _t = core._t;
const Qweb = core.qweb;

payloxPage.include({

    init: function (parent, options) {
        this._super(parent, options);
        this.systemJewelryPayment = false;
    },

    start: function () {
        return this._super.apply(this, arguments).then(() => {
            if (this.system.value === 'jewelry') {
                window.addEventListener('payment-started', () => {
                    this.systemJewelryPayment = true;
                    this._getInstallment();
                });
                window.addEventListener('payment-stopped', () => {
                    this.systemJewelryPayment = false;

                    this.installment.colempty.$.removeClass('d-none');
                    this.installment.col.$.addClass('d-none');
                    this.installment.col.html = '';
                    this.installment.cols = [];
    
                    this.installment.rowempty.$.removeClass('d-none');
                    this.installment.row.$.addClass('d-none');
                    this.installment.row.html = '';
                    this.installment.rows = [];
    
                    this.card.logo.html = '';
                    this.card.logo.$.removeClass('show');
                    this.card.bin = '';
                    this.card.family = '';
                });
            }
        });
    },

    _checkData: function () {
        if (this.system.value === 'jewelry') {
            if (!this.systemJewelryPayment) {
                this.displayNotification({
                    type: 'warning',
                    title: _t('Warning'),
                    message: _t('Price locked has been removed.\nPlease start the payment procedure all over.'),
                });
                this._enableButton();
                return false;
            }
        } else {
            return this._super.apply(this, arguments);
        }
    },

    //_getParams: function () {
    //    let params = this._super.apply(this, arguments);
    //    return params;
    //},
});

publicWidget.registry.payloxSystemJewelry = systemPage.extend({
    selector: '.payment-jewelry #wrapwrap',
    xmlDependencies: ['/payment_jewelry/static/src/xml/page.xml'],

    init: function (parent, options) {
        this._super(parent, options);
        this._saveOrder = _.debounce(this._save, 1000);
        this._saveTime = undefined;

        this.lines = {};
        this.brands = {};
        this.products = {};
        this.margin = 0;
        this.validity = 0;
        this.commission = 0;
        this.jewelry = {
            price: new fields.float({
                default: 0,
            }),
            qty: new fields.integer({
                default: 0,
                events: [['change', this._onChangeQty]],
            }),
            amount: new fields.float({
                default: 0,
            }),
            margin: new fields.float({
                default: 0,
            }),
            validity: new fields.float({
                default: 0,
            }),
            commission: new fields.float({
                default: 0,
            }),
            subtotal: new fields.float({
                default: 0,
            }),
            fee: new fields.float({
                default: 0,
            }),
            total: new fields.float({
                default: 0,
            }),
            counter: new fields.element(),
            items: new fields.element(),
            lines: new fields.element(),
            plus: new fields.element({
                events: [['click', this._onClickPlus]],
            }),
            minus: new fields.element({
                events: [['click', this._onClickMinus]],
            }),
            brands: new fields.element({
                events: [['click', this._onClickBrands]],
            }),
            policy: new fields.element({
                events: [['click', this._onClickPolicy]],
            }),
            pay: new fields.element({
                events: [['click', this._onClickPay]],
            }),
            back: new fields.element({
                events: [['click', this._onClickBack]],
            }),
        }
    },

    start: function () {
        return this._super.apply(this, arguments).then(() => {
            this._getNumbers();
            this._getBrands();
            this._getProducts();
            this._updateLines();
            this._listenPrices();
        });
    },

    _save: function (values) {
        rpc.query({
            route: '/my/order',
            params: { values },
        }).then((res) => {
            this._saveTime = Date.now();
        }).catch((err) => {
            this.displayNotification({
                type: 'danger',
                title: _t('Error'),
                message: _t('An error occured.'),
            });
        });
    },

    _getNumbers: function () {
        this.margin = this.jewelry.margin.value; this.jewelry.margin.$.remove();
        this.validity = this.jewelry.validity.value; this.jewelry.validity.$.remove();
        this.commission = this.jewelry.commission.value; this.jewelry.commission.$.remove();
    },

    _getBrands: function () {
        let $brands = $('[field="jewelry.brands"]');
        $brands.each((i, e) => {
            let bid = e.dataset.id;
            let pid = e.dataset.product;
            if (!(pid in this.brands)) {
                this.brands[pid] = {};
            }
            this.brands[pid][bid] = {
                id: parseInt(bid),
                name: e.dataset.name,
                image: e.dataset.image,
            }
        });
    },

    _getProducts: function () {
        let $products = $('[field="jewelry.items"]');
        $products.each((i, e) => {
            let pid = e.dataset.id;
            this.products[pid] = {
                id: parseInt(pid),
                name: e.dataset.name,
                foreground: e.dataset.foreground,
                background: e.dataset.background,
            }
        });
    },

    _listenPrices: function () {
        const events = new EventSource('/longpolling/prices');
        console.log('Price service is active.');
        events.onmessage = (event) => {
            let changed = false;
            let $prices = this.jewelry.price.$;
            let currency = [this.currency.position, this.currency.symbol, this.currency.decimal];
            for (let data of event.data.split('\n')) {
                let [code, price] = data.split(';'); price = parseFloat(price);
                let $price = $prices.filter(`[data-id="${code}"]`);
                let value = $price.data('value');
                if (price == value) {
                    continue;
                } else if (price > value) {
                    $price.css({ backgroundColor: '#93daa3' });
                } else if (price < value) {
                    $price.css({ backgroundColor: '#eccfd1' });
                }

                changed = true;
                price *= this.margin;
                $price.animate({ backgroundColor: '#ffffff' }, 'slow');
                $price.data('value', price);
                $price.text(format.currency(price, ...currency));
                this._onChangePrice($price, false);
            }
            if (changed) {
                this._updateLines();
            }
        };
        events.onerror = () => {
            console.error('An error occured on price service. Reconnecting...');
            events.close();
            setTimeout(this._listenPrices.bind(this), 10000);
        };
    },

    _onChangePrice($price, update=true) {
        let $qty = this.jewelry.qty.$.filter(`.base[data-id=${$price.data('id')}]`);
        let $amount = this.jewelry.amount.$.filter(`[data-id=${$price.data('id')}]`);

        let qty = parseFloat($qty.val());
        let price = parseFloat($price.data('value'));
        let value = qty * price;

        $amount.data('qty', qty);
        $amount.data('price', price);
        $amount.data('value', value);
        $amount.text(format.currency(value, this.currency.position, this.currency.symbol, this.currency.decimal));

        if (update) {
            this._updateLines();
        }
    },

    _updateLines() {
        if (this.timeout) return;

        let subtotal = 0;
        let brands = {};
        let currency = [this.currency.position, this.currency.symbol, this.currency.decimal];
        this.jewelry.amount.$.filter(`.base`).each((i, e) => {
            let $e = $(e);
            let value = parseFloat($e.data('value'));
            if (value > 0) {
                let vid = $e.data('id');
                let bid = $e.data('brand');
                let pid = $e.data('product');
                let qty = parseFloat($e.data('qty'));
                let price = parseFloat($e.data('price'));
                let weight = parseFloat($e.data('weight'));
                this.lines[vid] = { pid: vid, price, qty };

                if (!(bid in brands)) {
                    brands[bid] = { products: {}, name: this.brands[pid][bid]['name'] };
                }

                if (!(pid in brands[bid]['products'])) {
                    brands[bid]['products'][pid] = { weight: 0, value: 0, name: this.products[pid]['name'] };
                }
                brands[bid]['products'][pid]['weight'] += qty * weight;
                brands[bid]['products'][pid]['value'] += value;
                subtotal += value;
            }
        });

        this.jewelry.brands.$.each((i, e) => {
            let $e = $(e);
            let $span = $e.find('span');
            let bid = parseInt($e.data('id'));
            let pid = parseInt($e.data('product'));

            let weight = brands?.[bid]?.['products']?.[pid]?.['weight'];
            if (weight) {
                $span.removeClass('d-none');
                $span.text(weight);
            } else {
                $span.addClass('d-none');
            }
        });

        brands = Object.values(brands);
        for (let brand of brands) {
            brand.products = Object.values(brand.products);
        }

        this.jewelry.lines.html = Qweb.render('paylox.jewelry.lines', {
            format,
            brands,
            currency: this.currency,
        });

        let fee = subtotal * this.commission;
        let total = subtotal + fee;
        this.amount.value = format.float(total);
        this.amount.$.trigger('update');

        this.jewelry.subtotal.text = format.currency(subtotal, ...currency);
        this.jewelry.fee.text = format.currency(fee, ...currency);
        this.jewelry.total.text = format.currency(total, ...currency);

        this._saveOrder({ lines: Object.values(this.lines) });
    },

    _onChangeQty(ev) {
        let $qty = $(ev.currentTarget);
        let pid = $qty.data('id');
        this.jewelry.qty.$.filter(`[data-id=${pid}]`).val($qty.val());

        let $price = this.jewelry.price.$.filter(`.base[data-id=${pid}]`);
        let $amount = this.jewelry.amount.$.filter(`[data-id=${pid}]`);

        let qty = parseFloat($qty.val());
        let price = parseFloat($price.data('value'));
        let value = qty * price;

        $amount.data('qty', qty);
        $amount.data('value', value);
        $amount.text(format.currency(value, this.currency.position, this.currency.symbol, this.currency.decimal));

        this._updateLines();
    },

    _onClickPlus(ev) {
        let btn = $(ev.currentTarget);
        let pid = btn.data('id');
        let qty = this.jewelry.qty.$.filter(`.base[data-id=${pid}]`);

        let val = qty.val();
        qty.val(+val+1);
        qty.trigger('change');
    },

    _onClickMinus(ev) {
        let btn = $(ev.currentTarget);
        let pid = btn.data('id');
        let qty = this.jewelry.qty.$.filter(`.base[data-id=${pid}]`);

        let val = qty.val();
        if (val > 0) {
            qty.val(+val-1);
        } else {
            qty.val(0);
        }
        qty.trigger('change');
    },

    _onClickBrands(ev) {
        let $btn = $(ev.currentTarget);
        let $item = this.jewelry.items.$.filter(`[data-id=${ $btn.data('product') }]`);
        if ($btn.hasClass('base')) {
            $item.find(`[data-brand]`).each((i, e) => $(e).addClass('d-none'));
            $item.find(`[data-brand=${ $btn.data('id') }]`).each((i, e) => $(e).removeClass('d-none'));
    
            this.jewelry.brands.$.filter(`[data-product=${ $btn.data('product') }]`).removeClass('active');
            this.jewelry.brands.$.filter(`[data-product=${ $btn.data('product') }][data-id=${ $btn.data('id') }]`).each((i, e) => $(e).addClass('active'));
        } else {   
            let pid = parseInt($item.data('id'));
            let brands = Object.values(this.brands[pid]);
            let foreground = $item.data('foreground');
            let background = $item.data('background');
            let popup = new dialog(this, {
                size: 'small',
                title: _t('Choose a brand'),
                $content: Qweb.render('paylox.jewelry.brands', { brands, foreground, background }),
            });
            popup.open().opened(() => {
                popup.$modal.addClass('payment-jewelry-brand-popup');
                popup.$modal.find('.modal-header').attr('style', `color:${foreground} !important;background-color:${background} !important`);
                popup.$modal.find('.modal-footer button').attr('style', `color:${foreground} !important;background-color:${background} !important`);
                popup.$modal.find('button').click((e) => {
                    let bid = parseInt(e.currentTarget.dataset.id);
                    if (!isNaN(bid)) {
                        $item.find(`[data-brand]`).each((i, e) => $(e).addClass('d-none'));
                        $item.find(`[data-brand=${ bid }]`).each((i, e) => $(e).removeClass('d-none'));
                
                        this.jewelry.brands.$.filter(`[data-product=${ $btn.data('product') }]`).removeClass('active');
                        this.jewelry.brands.$.filter(`[data-product=${ $btn.data('product') }][data-id=${ bid }]`).each((i, e) => $(e).addClass('active'));
                    }
                    popup.close();
                });
            });
        }
    },

    _onClickPolicy() {
        framework.showLoading();
        rpc.query({
            route: '/my/jewelry/policy',
        }).then((partner) => {
            let popup = new dialog(this, {
                size: 'small',
                technical: false,
                title: _t('My PoS Policy'),
                $content: Qweb.render('paylox.jewelry.policy', partner),
            });
            popup.open().opened(() => {
                let $loading = popup.$modal.find('.loading');
                popup.$modal.addClass('payment-jewelry-policy-popup');
                popup.$modal.find('button').click(() => {
                    $loading.addClass('show');
                    rpc.query({
                        route: '/my/jewelry/policy/send',
                    }).then((result) => {
                        if (result.error) {
                            this.displayNotification({
                                type: 'danger',
                                title: _t('Error'),
                                message: result.error,
                            });
                        } else {
                            this.displayNotification({
                                type: 'info',
                                title: _t('Success'),
                                message: _t('Policy has been sent succesfully.'),
                            });
                            popup.close();
                        }
                        $loading.removeClass('show');
                    }).guardedCatch(() => {
                        this.displayNotification({
                            type: 'danger',
                            title: _t('Error'),
                            message: _t('An error occured. Please contact with your system administrator.'),
                        });
                        $loading.removeClass('show');
                    });
                });
            });
            framework.hideLoading();
        }).guardedCatch(() => {
            this.displayNotification({
                type: 'danger',
                title: _t('Error'),
                message: _t('An error occured. Please contact with your system administrator.'),
            });
            framework.hideLoading();
        });
    },

    _onClickPay(ev) {
        $(document.body).addClass(['payment-form', this.validity > 0 ? 'payment-counter' : '']);
        $(ev.currentTarget).addClass('hide');
        this.jewelry.back.$.removeClass('hide');
        this._startPayment();
    },

    _onClickBack(ev) {
        $(document.body).removeClass(['payment-form', this.validity > 0 ? 'payment-counter' : '']);
        $(ev.currentTarget).addClass('hide');
        this.jewelry.pay.$.text(_t('Pay Now'));
        this.jewelry.pay.$.removeClass('hide');
        this._stopPayment();
    },

    _startPayment() {
        this._saveOrder({ lock: true });
        if (this.validity > 0) {
            const $counter = this.jewelry.counter.$.find('svg');
            const $progress = $counter.find('.progress');
            const counter = () => {
                if (this.timeout <= 0) {
                    this.jewelry.pay.$.text(_t('Restart Payment'));
                    this.jewelry.pay.$.removeClass('hide');
                    this._stopPayment();
                    return;
                }
    
                $counter.next().text(--this.timeout);
                $progress.css('stroke-dashoffset', 400 - 400 * this.timeout / this.validity);
            }

            this.timeout = this.validity + 1; counter();
            this.interval = setInterval(counter, 1000);
    
            $('[field="installment.table"] button').removeClass('disabled').removeAttr('disabled');
            $('[field="payment.button"]').removeClass('disabled').removeAttr('disabled');
            window.dispatchEvent(new Event('payment-started'));
        }
    },

    _stopPayment() {
        if (this.validity > 0) {
            this.timeout = undefined;
            clearInterval(this.interval);
    
            $('[field="installment.table"] button').addClass('disabled').attr('disabled', 'disabled');
            $('[field="payment.button"]').addClass('disabled').attr('disabled', 'disabled');
            window.dispatchEvent(new Event('payment-stopped'));
        }
        this._updateLines();
    },
});
