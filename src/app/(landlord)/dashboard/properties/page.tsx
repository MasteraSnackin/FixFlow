"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Building2, Plus, MapPin, User, Phone, X, Loader2, ChevronDown, ChevronUp } from "lucide-react";

type Unit = {
  id: string;
  unit_label: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  tenant_id: string | null;
};

type Property = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  units: Unit[];
};

export default function PropertiesPage() {
  const { isLoaded } = useUser();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedProp, setExpandedProp] = useState<string | null>(null);

  // Form state
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [unitInputs, setUnitInputs] = useState([
    { unit_label: "", tenant_name: "", tenant_phone: "", tenant_id: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    fetchProperties();
  }, [isLoaded]);

  async function fetchProperties() {
    setLoading(true);
    const res = await fetch("/api/properties");
    const data = await res.json();
    if (res.ok) {
      setProperties(data.properties || []);
    }
    setLoading(false);
  }

  function addUnitRow() {
    setUnitInputs([...unitInputs, { unit_label: "", tenant_name: "", tenant_phone: "", tenant_id: "" }]);
  }

  function removeUnitRow(index: number) {
    setUnitInputs(unitInputs.filter((_, i) => i !== index));
  }

  function updateUnit(index: number, field: string, value: string) {
    const updated = [...unitInputs];
    (updated[index] as any)[field] = value;
    setUnitInputs(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!address.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setFormError("All address fields are required.");
      return;
    }

    const validUnits = unitInputs.filter((u) => u.unit_label.trim());
    if (validUnits.length === 0) {
      setFormError("Add at least one unit with a label.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          zip: zip.trim(),
          units: validUnits,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Failed to create property");
      } else {
        // Reset form and refresh
        setAddress("");
        setCity("");
        setState("");
        setZip("");
        setUnitInputs([{ unit_label: "", tenant_name: "", tenant_phone: "", tenant_id: "" }]);
        setShowForm(false);
        fetchProperties();
      }
    } catch (err: any) {
      setFormError(err.message);
    }
    setSubmitting(false);
  }

  if (!isLoaded || loading) {
    return (
      <div className="max-w-5xl mx-auto p-8 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="text-accent animate-spin" />
          <span className="font-display font-bold uppercase tracking-widest text-navy/50">Loading Properties...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-8 pb-32">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold uppercase tracking-tight text-navy">
            Properties
          </h1>
          <p className="text-navy/70 border-l-4 border-accent pl-4 py-1 font-bold mt-2">
            Manage your portfolio. Add buildings, units, and assign tenants.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-navy font-display font-bold uppercase tracking-widest text-xs border-2 border-navy shadow-[3px_3px_0_0_var(--navy)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
          >
            ← Dashboard
          </Link>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-5 py-2 bg-accent text-white font-display font-bold uppercase tracking-widest text-xs border-2 border-navy shadow-[3px_3px_0_0_var(--navy)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? "Cancel" : "Add Property"}
          </button>
        </div>
      </div>

      {/* Add Property Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="brutal-card p-6 sm:p-8 space-y-6 border-l-4 border-l-accent">
          <h2 className="text-xl font-display font-bold uppercase tracking-wide text-navy">New Property</h2>

          {formError && (
            <div className="bg-red-50 border-2 border-danger text-danger p-3 text-sm font-bold">{formError}</div>
          )}

          {/* Address Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-navy mb-1">Street Address *</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="14 Floral Street"
                className="w-full p-3 border-2 border-navy font-medium text-navy bg-white focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-navy mb-1">City *</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="London"
                className="w-full p-3 border-2 border-navy font-medium text-navy bg-white focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-bold uppercase tracking-widest text-navy mb-1">County / Region *</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="Greater London"
                  className="w-full p-3 border-2 border-navy font-medium text-navy bg-white focus:outline-none focus:border-accent"
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold uppercase tracking-widest text-navy mb-1">Postcode *</label>
                <input
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="WC2E 9DH"
                  maxLength={12}
                  className="w-full p-3 border-2 border-navy font-medium text-navy bg-white focus:outline-none focus:border-accent"
                  required
                />
              </div>
            </div>
          </div>

          {/* Units */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-widest text-navy">Units</label>
              <button type="button" onClick={addUnitRow} className="text-xs font-bold uppercase tracking-widest text-accent hover:text-navy transition-colors flex items-center gap-1">
                <Plus size={14} /> Add Unit
              </button>
            </div>

            <p className="text-xs text-navy/60 font-medium mb-3">
              To let a tenant submit requests, paste their Clerk user ID into
              the unit&apos;s `tenant_id` field.
            </p>

            <div className="space-y-3">
              {unitInputs.map((unit, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-2 p-3 bg-gray-50 border-2 border-navy/20">
                  <input
                    type="text"
                    value={unit.unit_label}
                    onChange={(e) => updateUnit(i, "unit_label", e.target.value)}
                    placeholder="Flat 1"
                    className="flex-1 p-2 border-2 border-navy/30 text-sm font-medium text-navy bg-white focus:outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    value={unit.tenant_name}
                    onChange={(e) => updateUnit(i, "tenant_name", e.target.value)}
                    placeholder="Tenant Name"
                    className="flex-1 p-2 border-2 border-navy/30 text-sm font-medium text-navy bg-white focus:outline-none focus:border-accent"
                  />
                  <input
                    type="tel"
                    value={unit.tenant_phone}
                    onChange={(e) => updateUnit(i, "tenant_phone", e.target.value)}
                    placeholder="020 7946 0110"
                    className="flex-1 p-2 border-2 border-navy/30 text-sm font-medium text-navy bg-white focus:outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    value={unit.tenant_id}
                    onChange={(e) => updateUnit(i, "tenant_id", e.target.value)}
                    placeholder="Clerk User ID"
                    className="flex-1 p-2 border-2 border-navy/30 text-sm font-medium text-navy bg-white focus:outline-none focus:border-accent"
                  />
                  {unitInputs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeUnitRow(i)}
                      className="p-2 text-danger hover:bg-red-50 transition-colors self-center"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto px-8 py-3 bg-navy text-white font-display font-bold uppercase tracking-widest text-sm border-2 border-navy shadow-[4px_4px_0_0_var(--accent)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 justify-center"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Building2 size={18} />}
            {submitting ? "Creating..." : "Create Property"}
          </button>
        </form>
      )}

      {/* Properties List */}
      {properties.length === 0 && !showForm ? (
        <div className="brutal-card border-dashed p-12 text-center">
          <Building2 size={48} className="text-navy/20 mx-auto mb-4" />
          <h2 className="font-display font-bold uppercase tracking-widest text-navy/50 mb-2">No Properties Yet</h2>
          <p className="text-navy/40 font-medium mb-6">Add your first property to start managing maintenance.</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-navy text-white font-display font-bold uppercase tracking-widest text-sm border-2 border-navy shadow-[4px_4px_0_0_var(--accent)] hover:bg-accent transition-colors"
          >
            <Plus size={18} /> Add Property
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {properties.map((prop) => {
            const isExpanded = expandedProp === prop.id;
            const unitCount = prop.units?.length || 0;

            return (
              <div key={prop.id} className="brutal-card overflow-hidden">
                <button
                  onClick={() => setExpandedProp(isExpanded ? null : prop.id)}
                  className="w-full p-5 sm:p-6 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-navy text-white flex items-center justify-center flex-shrink-0">
                      <Building2 size={20} />
                    </div>
                    <div>
                      <h3 className="font-display font-bold uppercase tracking-wide text-navy text-lg">
                        {prop.address}
                      </h3>
                      <p className="text-sm text-navy/60 font-medium flex items-center gap-1 mt-0.5">
                        <MapPin size={12} /> {prop.city}, {prop.state} {prop.zip}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 bg-gray-100 text-xs font-bold uppercase tracking-widest text-navy border border-gray-300">
                      {unitCount} {unitCount === 1 ? "Unit" : "Units"}
                    </span>
                    {isExpanded ? <ChevronUp size={20} className="text-navy/50" /> : <ChevronDown size={20} className="text-navy/50" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t-2 border-navy/10 px-5 sm:px-6 pb-5">
                    {prop.units && prop.units.length > 0 ? (
                      <div className="divide-y divide-navy/10">
                        {prop.units.map((unit) => (
                          <div key={unit.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                            <span className="font-bold text-navy text-sm uppercase tracking-widest min-w-[80px]">
                              {unit.unit_label}
                            </span>
                            <span className="flex items-center gap-1 text-sm text-navy/60">
                              <User size={12} /> {unit.tenant_name || "Vacant"}
                            </span>
                            {unit.tenant_phone && (
                              <span className="flex items-center gap-1 text-sm text-navy/60">
                                <Phone size={12} /> {unit.tenant_phone}
                              </span>
                            )}
                            {unit.tenant_id && (
                              <span className="text-xs text-navy/50 font-mono break-all">
                                tenant_id: {unit.tenant_id}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-4 text-sm text-navy/40 font-medium">No units added to this property yet.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
