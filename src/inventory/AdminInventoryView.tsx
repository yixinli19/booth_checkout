import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Edit3,
  FileSpreadsheet,
  Tag,
  CircleDot,
} from 'lucide-react';
import { useBooth } from '../context/BoothContext.tsx';
import { filterAdminInventory } from './inventoryLookup.ts';
import { formatCurrency, parsePriceToCents } from '../lib/money.ts';
import { generateUuid } from '../checkout/cartLogic.ts';
import type { InventoryItem, InventoryStatus, TagType } from '../types/domain.ts';

export const AdminInventoryView: React.FC = () => {
  const { activeEvent, inventory, vendors, saveInventoryItem } = useBooth();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('ALL');
  const [selectedTagType, setSelectedTagType] = useState<TagType | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<
    'ALL' | 'AVAILABLE' | 'SOLD' | 'REMOVED'
  >('ALL');

  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [priceInput, setPriceInput] = useState('24.00');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const vendorsById = useMemo(
    () => new Map(vendors.map((v) => [v.id, v])),
    [vendors]
  );

  const filteredItems = useMemo(
    () =>
      filterAdminInventory(inventory, vendorsById, {
        searchQuery,
        vendorId: selectedVendorId,
        tagType: selectedTagType,
        status: selectedStatus,
      }),
    [inventory, vendorsById, searchQuery, selectedVendorId, selectedTagType, selectedStatus]
  );

  const handleOpenNewItem = () => {
    if (!activeEvent || vendors.length === 0) return;
    const defaultVendor = vendors[0];
    setEditingItem({
      id: `item-manual-${generateUuid().slice(0, 6)}`,
      eventId: activeEvent.id,
      vendorId: defaultVendor.id,
      vendorLetter: defaultVendor.vendorLetter,
      itemCode: `${defaultVendor.vendorLetter}099`,
      itemName: '',
      description: '',
      priceCents: 2400,
      quantity: 1,
      initialQuantity: 1,
      tagType: 'HANG_TAG',
      status: 'AVAILABLE',
      originalWorkbookName: 'Manual_Admin_Entry.xlsx',
      originalSheetName: 'Sheet1',
      originalRowIndex: inventory.length + 2,
      updatedAt: new Date().toISOString(),
    });
    setPriceInput('24.00');
    setErrorMsg(null);
  };

  const handleOpenEditItem = (item: InventoryItem) => {
    setEditingItem({ ...item });
    setPriceInput((item.priceCents / 100).toFixed(2));
    setErrorMsg(null);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setErrorMsg(null);

    if (!editingItem.itemCode.trim()) {
      setErrorMsg('Item code is required.');
      return;
    }
    if (!editingItem.itemName.trim()) {
      setErrorMsg('Item name is required.');
      return;
    }
    const cents = parsePriceToCents(priceInput);
    if (cents === null) {
      setErrorMsg('Enter a valid positive price (e.g. 24.00).');
      return;
    }

    const vendor = vendorsById.get(editingItem.vendorId);
    if (!vendor) {
      setErrorMsg('Every inventory item must belong to a valid vendor.');
      return;
    }

    await saveInventoryItem({
      ...editingItem,
      vendorLetter: vendor.vendorLetter,
      priceCents: cents,
      initialQuantity: Math.max(editingItem.initialQuantity, editingItem.quantity),
    });
    setEditingItem(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Event Inventory Catalog ({inventory.length} records)
          </h1>
          <p className="text-xs text-slate-600">
            Search by item code, name, vendor, letter, price, or tag type. Includes spreadsheet lineage.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenNewItem}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 self-start cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Inventory Item</span>
        </button>
      </div>

      {/* Multi-Field Search & Filter Bar (Section 26) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs grid grid-cols-1 sm:grid-cols-12 gap-2.5">
        <div className="sm:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search code (A002), name, vendor, or price ($32)..."
            className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 text-xs sm:text-sm"
          />
        </div>

        <div className="sm:col-span-3">
          <select
            value={selectedVendorId}
            onChange={(e) => setSelectedVendorId(e.target.value)}
            aria-label="Filter by Vendor"
            className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
          >
            <option value="ALL">All Vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                Vendor {v.vendorLetter} — {v.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <select
            value={selectedTagType}
            onChange={(e) =>
              setSelectedTagType(e.target.value as TagType | 'ALL')
            }
            aria-label="Filter by Tag Type"
            className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
          >
            <option value="ALL">All Tag Types</option>
            <option value="HANG_TAG">Hang Tag</option>
            <option value="DOT">Dot Sticker</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <select
            value={selectedStatus}
            onChange={(e) =>
              setSelectedStatus(
                e.target.value as 'ALL' | 'AVAILABLE' | 'SOLD' | 'REMOVED'
              )
            }
            aria-label="Filter by Status"
            className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
          >
            <option value="ALL">All Status</option>
            <option value="AVAILABLE">Available</option>
            <option value="SOLD">Sold</option>
            <option value="REMOVED">Removed</option>
          </select>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase border-b border-slate-200">
            <tr>
              <th className="py-3 px-3.5">Code</th>
              <th className="py-3 px-3.5">Item</th>
              <th className="py-3 px-3.5">Vendor</th>
              <th className="py-3 px-3.5">Tag</th>
              <th className="py-3 px-3.5 text-right">Price</th>
              <th className="py-3 px-3.5 text-center">Qty</th>
              <th className="py-3 px-3.5">Status</th>
              <th className="py-3 px-3.5">Workbook Lineage</th>
              <th className="py-3 px-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.map((item) => {
              const vendor = vendorsById.get(item.vendorId);
              return (
                <tr key={item.id} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">
                    {item.itemCode}
                  </td>
                  <td className="py-2.5 px-3.5">
                    <div className="flex items-center gap-2.5">
                      {item.photoUrl && (
                        <img
                          src={item.photoUrl}
                          alt={item.itemName}
                          className="w-8 h-8 rounded-md object-cover border border-slate-200 shrink-0"
                        />
                      )}
                      <div>
                        <div className="font-bold text-slate-900">
                          {item.itemName}
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-xs">
                          {item.description}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3.5">
                    <span className="font-semibold text-slate-800">
                      {item.vendorLetter} — {vendor?.name ?? item.vendorLetter}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5">
                    {item.tagType === 'HANG_TAG' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                        <Tag className="w-3 h-3" />
                        Hang Tag
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-800">
                        <CircleDot className="w-3 h-3" />
                        Dot
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(item.priceCents)}
                  </td>
                  <td className="py-2.5 px-3.5 text-center font-mono">
                    {item.quantity} / {item.initialQuantity}
                  </td>
                  <td className="py-2.5 px-3.5">
                    {item.status === 'AVAILABLE' && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        Available
                      </span>
                    )}
                    {item.status === 'SOLD' && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                        Sold {item.soldInOrderNumber ? `(${item.soldInOrderNumber})` : ''}
                      </span>
                    )}
                    {item.status === 'REMOVED' && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-500">
                        Removed
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 text-xs text-slate-500">
                    {item.originalWorkbookName ? (
                      <span className="inline-flex items-center gap-1">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[160px]">
                          {item.originalSheetName} (Row {item.originalRowIndex})
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleOpenEditItem(item)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit / Add Inventory Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveItem}
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4"
          >
            <h3 className="text-lg font-bold text-slate-900">
              {inventory.some((i) => i.id === editingItem.id)
                ? `Edit Item ${editingItem.itemCode}`
                : 'Add Inventory Item'}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Vendor
                </label>
                <select
                  value={editingItem.vendorId}
                  onChange={(e) => {
                    const v = vendorsById.get(e.target.value);
                    setEditingItem({
                      ...editingItem,
                      vendorId: e.target.value,
                      vendorLetter: v?.vendorLetter ?? editingItem.vendorLetter,
                    });
                  }}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vendorLetter} — {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Item Code
                </label>
                <input
                  type="text"
                  value={editingItem.itemCode}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      itemCode: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 font-mono text-sm font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Item Name
              </label>
              <input
                type="text"
                value={editingItem.itemName}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, itemName: e.target.value })
                }
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={editingItem.description}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    description: e.target.value,
                  })
                }
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Price ($)
                </label>
                <input
                  type="text"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min={0}
                  value={editingItem.quantity}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      quantity: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={editingItem.status}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      status: e.target.value as InventoryStatus,
                    })
                  }
                  className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="SOLD">Sold</option>
                  <option value="REMOVED">Removed</option>
                </select>
              </div>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                {errorMsg}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                Save Item
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
