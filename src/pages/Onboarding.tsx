import { useState, FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Store, MapPin, ChefHat, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface RestaurantField {
  restaurantName: string;
  outletName: string;
  location: string;
}

export function Onboarding() {
  const [restaurants, setRestaurants] = useState<RestaurantField[]>([
    { restaurantName: "", outletName: "", location: "" }
  ]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, checkOnboardingStatus, hasCompletedOnboarding } = useAuth();

  useEffect(() => {
    if (hasCompletedOnboarding) {
      navigate("/dashboard");
    }
  }, [hasCompletedOnboarding, navigate]);

  const handleAddRestaurant = () => {
    setRestaurants([...restaurants, { restaurantName: "", outletName: "", location: "" }]);
  };

  const handleRemoveRestaurant = (index: number) => {
    setRestaurants(restaurants.filter((_, i) => i !== index));
  };

  const updateRestaurant = (index: number, field: keyof RestaurantField, value: string) => {
    const newRestaurants = [...restaurants];
    newRestaurants[index][field] = value;
    setRestaurants(newRestaurants);
  };

  const handleComplete = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Check if at least one restaurant is valid
    const validRestaurants = restaurants.filter(r => r.restaurantName && r.outletName && r.location);
    if (validRestaurants.length === 0) return;

    setLoading(true);

    try {
      // Create Restaurants and their first Outlets
      for (const rest of validRestaurants) {
         const restRef = await addDoc(collection(db, "restaurants"), {
           name: rest.restaurantName,
           ownerId: user.uid,
           createdAt: Date.now()
         });

         await addDoc(collection(db, "outlets"), {
           restaurantId: restRef.id,
           name: rest.outletName,
           location: rest.location,
           tableCount: 12,
           createdAt: Date.now()
         });
      }

      // Update user doc to mark onboarding complete
      await updateDoc(doc(db, "users", user.uid), {
         hasCompletedOnboarding: true
      });
      await checkOnboardingStatus();
    } catch (err) {
      console.error("Error setting up:", err);
      alert("Failed to setup. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl text-center">
        <div className="mx-auto h-12 w-12 bg-orange-600 rounded-xl flex items-center justify-center">
          <ChefHat className="h-8 w-8 text-white" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-zinc-900">
          Welcome to CraveCraft
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-600">
          Let's set up your restaurants and their initial outlets.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-white py-8 px-4 shadow sm:rounded-xl sm:px-10 border border-zinc-200">
          <form className="space-y-6" onSubmit={handleComplete}>
            <div className="flex justify-between items-center mb-4">
               <h3 className="text-lg font-medium text-zinc-900">Your Restaurants</h3>
               <button type="button" onClick={handleAddRestaurant} className="text-sm font-medium text-orange-600 flex items-center gap-1 hover:text-orange-500">
                  <Plus className="w-4 h-4" /> Add Another
               </button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-2">
               {restaurants.map((rest, idx) => (
                  <div key={idx} className="p-6 border border-zinc-200 rounded-xl bg-zinc-50 relative">
                     {restaurants.length > 1 && (
                        <button type="button" onClick={() => handleRemoveRestaurant(idx)} className="absolute top-4 right-4 text-zinc-400 hover:text-red-500 transition-colors">
                           <Trash2 className="w-5 h-5" />
                        </button>
                     )}
                    <h4 className="font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                       <Store className="w-4 h-4 text-orange-600" /> Restaurant #{idx + 1}
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700">Brand Name</label>
                        <input
                          type="text"
                          required
                          value={rest.restaurantName}
                          onChange={(e) => updateRestaurant(idx, 'restaurantName', e.target.value)}
                          className="mt-1 block w-full sm:text-sm border-zinc-300 rounded-md py-2 px-3 border focus:ring-orange-500 focus:border-orange-500"
                          placeholder="e.g. The Spice Garden"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-zinc-700">Outlet Name</label>
                          <input
                            type="text"
                            required
                            value={rest.outletName}
                            onChange={(e) => updateRestaurant(idx, 'outletName', e.target.value)}
                            className="mt-1 block w-full sm:text-sm border-zinc-300 rounded-md py-2 px-3 border focus:ring-orange-500 focus:border-orange-500"
                            placeholder="e.g. Downtown Branch"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-700">Location</label>
                          <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <MapPin className="h-4 w-4 text-zinc-400" />
                            </div>
                            <input
                              type="text"
                              required
                              value={rest.location}
                              onChange={(e) => updateRestaurant(idx, 'location', e.target.value)}
                              className="block w-full pl-9 sm:text-sm border-zinc-300 rounded-md py-2 border focus:ring-orange-500 focus:border-orange-500"
                              placeholder="e.g. Mumbai"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
               ))}
            </div>

            <div className="pt-4 border-t border-zinc-100">
              <button
                type="submit"
                disabled={loading || restaurants.some(r => !r.restaurantName || !r.outletName || !r.location)}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Setting up...' : <><CheckCircle2 className="w-5 h-5 mr-2"/> Finish Setup</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
